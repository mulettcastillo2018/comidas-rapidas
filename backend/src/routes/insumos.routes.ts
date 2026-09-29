import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { diaLocal, esDiaValido, rangoDeDias } from "../lib/fechas";
import { nombreCompleto } from "../lib/nombre";
import { costoDeReceta, moverStock, recalcularCostos, revisarInsumos } from "../services/insumos";
import { filtroSedes, sedesDelReporte } from "../services/sedes";
import { mediodiaDe } from "./gastos.routes";

// Insumos (ingredientes) y recetas: solo admin.
export const insumosRouter = Router();
insumosRouter.use(requireAuth, requireAdmin);

const UNIDADES = ["GRAMO", "MILILITRO", "UNIDAD"] as const;

function nombreRepetido(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ErrorDeNegocio("Ya hay un insumo con ese nombre", 409);
  throw err;
}

// El insumo con su stock en la sede de trabajo (0 si nunca ha tenido).
async function conStockDeSede<I extends { id: string; costoUnitario: number }>(insumos: I[], sedeId: string) {
  const filas = await prisma.insumoSede.findMany({ where: { sedeId, insumoId: { in: insumos.map((i) => i.id) } } });
  const porId = new Map(filas.map((f) => [f.insumoId, f]));
  return insumos.map((i) => {
    const f = porId.get(i.id);
    return { ...i, stock: f?.stock ?? 0, stockMinimo: f?.stockMinimo ?? 0, alertaStockBajo: f?.alertaStockBajo ?? false };
  });
}

insumosRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const insumos = await prisma.insumo.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: { recetas: { select: { producto: { select: { nombre: true } } } }, _count: { select: { adiciones: true } } },
    });
    const conStock = await conStockDeSede(insumos, req.sedeId);
    res.json(
      conStock.map(({ recetas, _count, ...i }) => ({
        ...i,
        valorEnInventario: Math.round(Math.max(0, i.stock) * i.costoUnitario),
        usadoEn: recetas.map((r) => r.producto.nombre),
        enAdiciones: _count.adiciones,
      }))
    );
  })
);

async function insumoEnSede(insumoId: string, sedeId: string) {
  const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
  return (await conStockDeSede([insumo], sedeId))[0];
}

const nuevoSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  unidad: z.enum(UNIDADES),
  stockInicial: z.number().min(0).max(10_000_000),
  stockMinimo: z.number().min(0).max(10_000_000),
  // Pesos por unidad base (g, ml o unidad).
  costoUnitario: z.number().min(0).max(10_000_000),
});

insumosRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = nuevoSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa el insumo: nombre, unidad, cantidad actual, mínimo y costo", 400);
    const { stockInicial, stockMinimo, ...datos } = parsed.data;
    const insumo = await prisma
      .$transaction(async (tx) => {
        const creado = await tx.insumo.create({ data: datos });
        // Lo que hay ahora es de la sede donde se está trabajando.
        await tx.insumoSede.create({ data: { insumoId: creado.id, sedeId: req.sedeId, stock: stockInicial, stockMinimo } });
        await tx.movimientoInsumo.create({
          data: { insumoId: creado.id, sedeId: req.sedeId, tipo: "AJUSTE", cantidad: stockInicial, stockResultante: stockInicial, nota: "Conteo inicial", userId: req.user!.userId },
        });
        return creado;
      })
      .catch(nombreRepetido);
    res.status(201).json(await insumoEnSede(insumo.id, req.sedeId));
  })
);

insumosRouter.put(
  "/:id",
  catchAsync(async (req, res) => {
    const parsed = z
      .object({ nombre: z.string().trim().min(2).max(80), stockMinimo: z.number().min(0), activo: z.boolean(), costoUnitario: z.number().min(0) })
      .partial()
      .safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa los datos del insumo", 400);
    const actual = await prisma.insumo.findUnique({ where: { id: req.params.id } });
    if (!actual) throw new ErrorDeNegocio("Insumo no encontrado", 404);
    const { stockMinimo, ...datos } = parsed.data;
    await prisma.insumo.update({ where: { id: actual.id }, data: datos }).catch(nombreRepetido);
    // El mínimo es de cada sede.
    if (stockMinimo !== undefined) {
      await prisma.insumoSede.upsert({
        where: { insumoId_sedeId: { insumoId: actual.id, sedeId: req.sedeId } },
        create: { insumoId: actual.id, sedeId: req.sedeId, stockMinimo },
        update: { stockMinimo, alertaStockBajo: false },
      });
    }
    if (datos.costoUnitario !== undefined) await recalcularCostos([actual.id]);
    await revisarInsumos([actual.id], req.sedeId);
    res.json(await insumoEnSede(actual.id, req.sedeId));
  })
);

const compraSchema = z.object({
  // En la unidad base (la pantalla convierte kg → g, L → ml).
  cantidad: z.number().positive().max(10_000_000),
  costoTotal: z.number().int().min(0).max(1_000_000_000),
  // Además, registrarla como gasto de insumos (y, si se pagó con la caja,
  // como salida del turno).
  registrarGasto: z.boolean().optional(),
  desdeCaja: z.boolean().optional(),
  nota: z.string().trim().max(200).optional(),
});

// Llegó mercancía: suma al inventario y ajusta el costo promedio.
insumosRouter.post(
  "/:id/compras",
  catchAsync(async (req, res) => {
    const parsed = compraSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Indica la cantidad que llegó y lo que costó en total", 400);
    const { cantidad, costoTotal, registrarGasto = false, desdeCaja = false, nota } = parsed.data;
    const hoy = diaLocal(new Date());

    const sedeId = req.sedeId;
    const insumoId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Insumo" WHERE id = ${req.params.id} FOR UPDATE`;
      const actual = await tx.insumo.findUnique({ where: { id: req.params.id } });
      if (!actual) throw new ErrorDeNegocio("Insumo no encontrado", 404);
      // Promedio ponderado entre lo que había en la sede (si había) y lo que
      // llegó; el costo es uno solo para todo el negocio.
      const enSede = await tx.insumoSede.findUnique({ where: { insumoId_sedeId: { insumoId: actual.id, sedeId } } });
      const existente = Math.max(0, enSede?.stock ?? 0);
      const costoUnitario = costoTotal > 0 ? (existente * actual.costoUnitario + costoTotal) / (existente + cantidad) : actual.costoUnitario;
      await tx.insumo.update({ where: { id: actual.id }, data: { costoUnitario } });
      const stock = await moverStock(tx, actual.id, sedeId, cantidad);
      await tx.movimientoInsumo.create({
        data: { insumoId: actual.id, sedeId, tipo: "COMPRA", cantidad, stockResultante: stock, costoTotal, nota: nota || null, userId: req.user!.userId },
      });
      if (registrarGasto && costoTotal > 0) {
        const concepto = `Compra de ${actual.nombre}${nota ? ` (${nota})` : ""}`.slice(0, 200);
        const movimiento = desdeCaja
          ? await tx.movimientoCaja.create({ data: { sedeId, tipo: "SALIDA", monto: costoTotal, concepto: `Gasto: ${concepto}`, registradoPorId: req.user!.userId } })
          : null;
        await tx.gasto.create({
          data: { sedeId, fecha: mediodiaDe(hoy), categoria: "INSUMOS", concepto, monto: costoTotal, movimientoCajaId: movimiento?.id ?? null, registradoPorId: req.user!.userId },
        });
      }
      return actual.id;
    });
    await recalcularCostos([insumoId]);
    await revisarInsumos([insumoId], sedeId);
    res.status(201).json(await insumoEnSede(insumoId, sedeId));
  })
);

// Conteo físico: deja lo que de verdad hay; la diferencia es lo que se perdió
// (o no se registró).
insumosRouter.post(
  "/:id/conteo",
  catchAsync(async (req, res) => {
    const parsed = z.object({ stockReal: z.number().min(0).max(10_000_000), nota: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Indica cuánto hay de verdad", 400);
    const sedeId = req.sedeId;
    const insumoId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Insumo" WHERE id = ${req.params.id} FOR UPDATE`;
      const actual = await tx.insumo.findUnique({ where: { id: req.params.id } });
      if (!actual) throw new ErrorDeNegocio("Insumo no encontrado", 404);
      const antes = (await tx.insumoSede.findUnique({ where: { insumoId_sedeId: { insumoId: actual.id, sedeId } } }))?.stock ?? 0;
      await tx.insumoSede.upsert({
        where: { insumoId_sedeId: { insumoId: actual.id, sedeId } },
        create: { insumoId: actual.id, sedeId, stock: parsed.data.stockReal },
        update: { stock: parsed.data.stockReal },
      });
      await tx.movimientoInsumo.create({
        data: { insumoId: actual.id, sedeId, tipo: "AJUSTE", cantidad: parsed.data.stockReal - antes, stockResultante: parsed.data.stockReal, nota: parsed.data.nota || "Conteo físico", userId: req.user!.userId },
      });
      return actual.id;
    });
    await revisarInsumos([insumoId], sedeId);
    res.status(201).json(await insumoEnSede(insumoId, sedeId));
  })
);

insumosRouter.get(
  "/:id/movimientos",
  catchAsync(async (req, res) => {
    const movimientos = await prisma.movimientoInsumo.findMany({
      where: { insumoId: req.params.id, sedeId: req.sedeId },
      orderBy: { creadoEn: "desc" },
      take: 60,
      include: { user: { select: { nombre: true, apellido: true } } },
    });
    res.json(movimientos.map(({ user, ...m }) => ({ ...m, usuario: user ? nombreCompleto(user) : null })));
  })
);

// Recetas de productos y adiciones.
const recetaSchema = z.object({
  items: z.array(z.object({ insumoId: z.string().min(1), cantidad: z.number().positive().max(100_000) })).max(40),
  costoDesdeReceta: z.boolean().optional(),
});

insumosRouter.get(
  "/recetas/:productoId",
  catchAsync(async (req, res) => {
    const producto = await prisma.producto.findUnique({
      where: { id: req.params.productoId },
      select: { id: true, nombre: true, costo: true, costoDesdeReceta: true, esCombo: true, receta: { include: { insumo: true } } },
    });
    if (!producto) throw new ErrorDeNegocio("Producto no encontrado", 404);
    res.json({ ...producto, costoReceta: costoDeReceta(producto.receta) });
  })
);

insumosRouter.put(
  "/recetas/:productoId",
  catchAsync(async (req, res) => {
    const parsed = recetaSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa la receta: cada ingrediente con una cantidad mayor que cero", 400);
    const producto = await prisma.producto.findUnique({ where: { id: req.params.productoId } });
    if (!producto) throw new ErrorDeNegocio("Producto no encontrado", 404);
    if (producto.esCombo) throw new ErrorDeNegocio("Un combo usa la receta de cada producto que lo compone", 400);
    const ids = parsed.data.items.map((i) => i.insumoId);
    if (new Set(ids).size !== ids.length) throw new ErrorDeNegocio("Un ingrediente está repetido en la receta", 400);
    if ((await prisma.insumo.count({ where: { id: { in: ids } } })) !== ids.length) throw new ErrorDeNegocio("Uno de los ingredientes no existe", 400);
    await prisma.$transaction([
      prisma.recetaItem.deleteMany({ where: { productoId: producto.id } }),
      prisma.recetaItem.createMany({ data: parsed.data.items.map((i) => ({ productoId: producto.id, insumoId: i.insumoId, cantidad: i.cantidad })) }),
      prisma.producto.update({ where: { id: producto.id }, data: { costoDesdeReceta: (parsed.data.costoDesdeReceta ?? producto.costoDesdeReceta) && ids.length > 0 } }),
    ]);
    await recalcularCostos(ids.length > 0 ? ids : undefined);
    const actualizado = await prisma.producto.findUniqueOrThrow({
      where: { id: producto.id },
      select: { id: true, nombre: true, costo: true, costoDesdeReceta: true, esCombo: true, receta: { include: { insumo: true } } },
    });
    res.json({ ...actualizado, costoReceta: costoDeReceta(actualizado.receta) });
  })
);

insumosRouter.get(
  "/adiciones/:adicionId",
  catchAsync(async (req, res) => {
    const adicion = await prisma.adicion.findUnique({ where: { id: req.params.adicionId }, include: { insumos: { include: { insumo: true } } } });
    if (!adicion) throw new ErrorDeNegocio("Adición no encontrada", 404);
    res.json(adicion);
  })
);

insumosRouter.put(
  "/adiciones/:adicionId",
  catchAsync(async (req, res) => {
    const parsed = recetaSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa los ingredientes de la adición", 400);
    const adicion = await prisma.adicion.findUnique({ where: { id: req.params.adicionId } });
    if (!adicion) throw new ErrorDeNegocio("Adición no encontrada", 404);
    const ids = parsed.data.items.map((i) => i.insumoId);
    if (new Set(ids).size !== ids.length) throw new ErrorDeNegocio("Un ingrediente está repetido", 400);
    await prisma.$transaction([
      prisma.adicionInsumo.deleteMany({ where: { adicionId: adicion.id } }),
      prisma.adicionInsumo.createMany({ data: parsed.data.items.map((i) => ({ adicionId: adicion.id, insumoId: i.insumoId, cantidad: i.cantidad })) }),
    ]);
    if (ids.length > 0) await recalcularCostos(ids);
    res.json(await prisma.adicion.findUnique({ where: { id: adicion.id }, include: { insumos: { include: { insumo: true } } } }));
  })
);

// Consumo del rango: lo que las recetas dicen que se usó, lo que se compró y
// lo que faltó al contar (merma), valorizado al costo actual.
insumosRouter.get(
  "/consumo",
  catchAsync(async (req, res) => {
    const parsed = z.object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) }).safeParse(req.query);
    if (!parsed.success) throw new ErrorDeNegocio("Indica un rango de fechas válido", 400);
    const { inicio, fin } = rangoDeDias(parsed.data.desde, parsed.data.hasta);
    const [insumos, movimientos] = await Promise.all([
      prisma.insumo.findMany({ select: { id: true, nombre: true, unidad: true, costoUnitario: true } }),
      prisma.movimientoInsumo.groupBy({
        by: ["insumoId", "tipo"],
        where: { creadoEn: { gte: inicio, lt: fin }, ...filtroSedes(sedesDelReporte(req)), NOT: { tipo: "AJUSTE", nota: "Conteo inicial" } },
        _sum: { cantidad: true, costoTotal: true },
      }),
    ]);
    const suma = (insumoId: string, tipos: string[], campo: "cantidad" | "costoTotal" = "cantidad") =>
      movimientos.filter((m) => m.insumoId === insumoId && tipos.includes(m.tipo)).reduce((s, m) => s + (m._sum[campo] ?? 0), 0);
    const filas = insumos
      .map((i) => {
        const consumo = -suma(i.id, ["CONSUMO", "DEVOLUCION"]);
        const diferencia = suma(i.id, ["AJUSTE"]);
        return {
          insumoId: i.id,
          nombre: i.nombre,
          unidad: i.unidad,
          consumo,
          valorConsumo: Math.round(consumo * i.costoUnitario),
          compras: suma(i.id, ["COMPRA"]),
          valorCompras: suma(i.id, ["COMPRA"], "costoTotal"),
          // Negativo = faltó al contar (merma o consumo no registrado).
          diferenciaConteo: diferencia,
          valorDiferencia: Math.round(diferencia * i.costoUnitario),
        };
      })
      .filter((f) => f.consumo !== 0 || f.compras !== 0 || f.diferenciaConteo !== 0)
      .sort((a, b) => b.valorConsumo - a.valorConsumo);
    res.json({
      filas,
      totales: {
        valorConsumo: filas.reduce((s, f) => s + f.valorConsumo, 0),
        valorCompras: filas.reduce((s, f) => s + f.valorCompras, 0),
        merma: -filas.filter((f) => f.valorDiferencia < 0).reduce((s, f) => s + f.valorDiferencia, 0),
      },
    });
  })
);
