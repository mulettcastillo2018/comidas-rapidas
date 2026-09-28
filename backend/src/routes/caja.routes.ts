import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { nombreCompleto } from "../lib/nombre";

export const cajaRouter = Router();

type Cliente = Prisma.TransactionClient | typeof prisma;
const personaSelect = { select: { id: true, nombre: true, apellido: true, role: true } };

// Lo que entra en el próximo cierre: toda cuenta cobrada o dada por perdida
// y todo movimiento de efectivo que todavía no pertenece a ningún cierre, sin
// importar la hora (así lo que se registra justo mientras se cierra no queda
// por fuera de ambos turnos).
async function resumenSinCerrar(cliente: Cliente) {
  const [facturas, movimientos, ultimoCierre] = await Promise.all([
    cliente.factura.findMany({
      where: { cierreCajaId: null, estado: { in: ["PAGADA", "PERDIDA"] } },
      select: { id: true, estado: true, total: true, propinaMonto: true, pagadaEn: true, cerradaPorId: true, pagos: { select: { metodo: true, monto: true } } },
    }),
    cliente.movimientoCaja.findMany({ where: { cierreCajaId: null }, select: { id: true, tipo: true, monto: true, meseroId: true, creadoEn: true } }),
    cliente.cierreCaja.findFirst({ orderBy: { hasta: "desc" }, select: { hasta: true } }),
  ]);
  const pagadas = facturas.filter((f) => f.estado === "PAGADA");
  const perdidas = facturas.filter((f) => f.estado === "PERDIDA");
  const pagos = pagadas.flatMap((f) => f.pagos);
  const totalPor = (metodo: string) => pagos.filter((p) => p.metodo === metodo).reduce((s, p) => s + p.monto, 0);
  const sumaMovimientos = (tipo: string) => movimientos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
  const fechas = [...facturas.map((f) => f.pagadaEn), ...movimientos.map((m) => m.creadoEn)].filter((f): f is Date => Boolean(f));
  const primeraFecha = fechas.length > 0 ? new Date(Math.min(...fechas.map((f) => f.getTime()))) : null;

  return {
    facturaIds: facturas.map((f) => f.id),
    movimientoIds: movimientos.map((m) => m.id),
    desde: ultimoCierre?.hasta ?? primeraFecha ?? new Date(),
    cuentasPagadas: pagadas.length,
    totalEfectivo: totalPor("EFECTIVO"),
    totalTarjeta: totalPor("TARJETA"),
    totalNequi: totalPor("NEQUI"),
    totalDaviplata: totalPor("DAVIPLATA"),
    totalTransferencia: totalPor("TRANSFERENCIA"),
    totalOtro: totalPor("OTRO"),
    // Lo vendido por apps: no es plata en la caja (la app lo consigna).
    totalPlataforma: totalPor("PLATAFORMA"),
    propinas: pagadas.reduce((s, f) => s + f.propinaMonto, 0),
    cuentasPerdidas: perdidas.length,
    totalPerdidas: perdidas.reduce((s, f) => s + f.total, 0),
    totalEntradas: sumaMovimientos("ENTRADA"),
    totalSalidas: sumaMovimientos("SALIDA"),
    // Para el cuadre por mesero.
    efectivoPorCobrador: pagadas.map((f) => ({
      userId: f.cerradaPorId,
      efectivo: f.pagos.filter((p) => p.metodo === "EFECTIVO").reduce((s, p) => s + p.monto, 0),
    })),
    entregas: movimientos.filter((m) => m.tipo === "ENTREGA_MESERO"),
  };
}

// Cuánto efectivo cobró cada mesero en sus mesas y cuánto ya entregó a la
// caja. El admin cobra directamente en la caja, así que no se le pide entrega.
async function cuadrePorMesero(resumen: Awaited<ReturnType<typeof resumenSinCerrar>>) {
  const porPersona = new Map<string, { cobrado: number; entregado: number }>();
  for (const { userId, efectivo } of resumen.efectivoPorCobrador) {
    if (!userId || efectivo === 0) continue;
    const p = porPersona.get(userId) ?? { cobrado: 0, entregado: 0 };
    p.cobrado += efectivo;
    porPersona.set(userId, p);
  }
  for (const entrega of resumen.entregas) {
    if (!entrega.meseroId) continue;
    const p = porPersona.get(entrega.meseroId) ?? { cobrado: 0, entregado: 0 };
    p.entregado += entrega.monto;
    porPersona.set(entrega.meseroId, p);
  }
  const personas = await prisma.user.findMany({ where: { id: { in: [...porPersona.keys()] } }, select: personaSelect.select });
  return personas
    .filter((u) => u.role !== "ADMIN")
    .map((u) => {
      const { cobrado, entregado } = porPersona.get(u.id)!;
      return { userId: u.id, nombre: nombreCompleto(u), cobrado, entregado, pendiente: cobrado - entregado };
    })
    .sort((a, b) => b.pendiente - a.pendiente);
}

function esperadoEnCaja(baseInicial: number, r: { totalEfectivo: number; totalEntradas: number; totalSalidas: number }) {
  return baseInicial + r.totalEfectivo + r.totalEntradas - r.totalSalidas;
}

cajaRouter.get(
  "/actual",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const [resumen, mesasAbiertas, cuentasPorCobrar] = await Promise.all([
      resumenSinCerrar(prisma),
      prisma.mesaSesion.count({ where: { estado: { not: "CERRADA" } } }),
      prisma.factura.count({ where: { estado: "PENDIENTE" } }),
    ]);
    const { facturaIds: _f, movimientoIds, efectivoPorCobrador: _e, entregas: _en, ...totales } = resumen;
    const [movimientos, porMesero] = await Promise.all([
      prisma.movimientoCaja.findMany({
        where: { id: { in: movimientoIds } },
        include: { mesero: personaSelect, registradoPor: personaSelect },
        orderBy: { creadoEn: "desc" },
      }),
      cuadrePorMesero(resumen),
    ]);
    // Avisos, no bloqueos: el turno puede cerrarse con mesas aún abiertas;
    // lo que cobren después simplemente entra en el siguiente cierre.
    res.json({ ...totales, movimientos, porMesero, mesasAbiertas, cuentasPorCobrar });
  })
);

const movimientoSchema = z
  .object({
    tipo: z.enum(["ENTRADA", "SALIDA", "ENTREGA_MESERO"]),
    monto: z.number().int().positive(),
    concepto: z.string().trim().max(200).optional(),
    meseroId: z.string().min(1).optional(),
  })
  .refine((m) => m.tipo === "ENTREGA_MESERO" || (m.concepto && m.concepto.length > 0), { message: "Escribe el concepto (p. ej. pago al proveedor del pan)" })
  .refine((m) => m.tipo !== "ENTREGA_MESERO" || Boolean(m.meseroId), { message: "Indica qué mesero entrega el efectivo" });

// Plata que entra o sale de la caja sin ser una venta, o la entrega del
// efectivo que un mesero cobró en sus mesas.
cajaRouter.post(
  "/movimientos",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = movimientoSchema.safeParse(req.body);
    if (!parsed.success) {
      const { formErrors } = parsed.error.flatten();
      res.status(400).json({ error: formErrors[0] ?? "Revisa el tipo y el monto (número entero, sin puntos)" });
      return;
    }
    const { tipo, monto, concepto, meseroId } = parsed.data;
    if (tipo === "ENTREGA_MESERO") {
      const mesero = await prisma.user.findUnique({ where: { id: meseroId } });
      if (!mesero || mesero.role === "ADMIN") throw new ErrorDeNegocio("El usuario indicado no es un mesero", 400);
    }
    const movimiento = await prisma.movimientoCaja.create({
      data: {
        tipo,
        monto,
        concepto: concepto || "Entrega de efectivo del mesero",
        meseroId: tipo === "ENTREGA_MESERO" ? meseroId : null,
        registradoPorId: req.user!.userId,
      },
      include: { mesero: personaSelect, registradoPor: personaSelect },
    });
    res.status(201).json(movimiento);
  })
);

// Para corregir un error de digitación, mientras no se haya cerrado caja.
cajaRouter.delete(
  "/movimientos/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    // El pago de un gasto se borra junto con el gasto, desde Gastos.
    if (await prisma.gasto.findUnique({ where: { movimientoCajaId: req.params.id } })) {
      throw new ErrorDeNegocio("Esta salida es el pago de un gasto: bórrala desde Gastos", 409);
    }
    const borrado = await prisma.movimientoCaja.deleteMany({ where: { id: req.params.id, cierreCajaId: null } });
    if (borrado.count === 0) throw new ErrorDeNegocio("Ese movimiento no existe o ya pertenece a un cierre de caja", 409);
    res.status(204).send();
  })
);

const cierreSchema = z.object({
  baseInicial: z.number().int().min(0),
  efectivoContado: z.number().int().min(0),
  notas: z.string().trim().max(500).nullable().optional(),
});

cajaRouter.post(
  "/cierres",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = cierreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisa los valores: la base y el efectivo contado deben ser números enteros, sin puntos ni signos." });
      return;
    }
    const { baseInicial, efectivoContado, notas } = parsed.data;

    const cierre = await prisma.$transaction(async (tx) => {
      const { facturaIds, movimientoIds, efectivoPorCobrador: _e, entregas: _en, ...totales } = await resumenSinCerrar(tx);
      if (facturaIds.length + movimientoIds.length === 0) throw new ErrorDeNegocio("No hay cuentas cobradas ni movimientos desde el último cierre.", 409);

      const creado = await tx.cierreCaja.create({
        data: {
          ...totales,
          cerradoPorId: req.user!.userId,
          baseInicial,
          efectivoContado,
          diferencia: efectivoContado - esperadoEnCaja(baseInicial, totales),
          notas: notas || null,
        },
      });
      // Si otro admin cerró caja al mismo tiempo, estas cuentas ya quedaron
      // en su cierre: se deshace este para no contarlas dos veces.
      const facturas = await tx.factura.updateMany({ where: { id: { in: facturaIds }, cierreCajaId: null }, data: { cierreCajaId: creado.id } });
      const movimientos = await tx.movimientoCaja.updateMany({ where: { id: { in: movimientoIds }, cierreCajaId: null }, data: { cierreCajaId: creado.id } });
      if (facturas.count !== facturaIds.length || movimientos.count !== movimientoIds.length) {
        throw new ErrorDeNegocio("Otro cierre de caja se registró al mismo tiempo. Recarga para ver los valores actualizados.", 409);
      }
      return creado;
    });

    res.status(201).json(await prisma.cierreCaja.findUnique({ where: { id: cierre.id }, include: { cerradoPor: { select: { id: true, nombre: true, apellido: true } } } }));
  })
);

cajaRouter.get(
  "/cierres",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const cierres = await prisma.cierreCaja.findMany({
      orderBy: { hasta: "desc" },
      take: 60,
      include: { cerradoPor: { select: { id: true, nombre: true, apellido: true } } },
    });
    res.json(cierres);
  })
);
