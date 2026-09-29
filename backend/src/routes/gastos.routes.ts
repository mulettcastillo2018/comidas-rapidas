import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { nombreCompleto } from "../lib/nombre";
import { diaLocal, esDiaValido, rangoDeDias } from "../lib/fechas";
import { sedesDelReporte } from "../services/sedes";

export const gastosRouter = Router();
gastosRouter.use(requireAuth, requireAdmin);

const CATEGORIAS = ["INSUMOS", "NOMINA", "ARRIENDO", "SERVICIOS", "MANTENIMIENTO", "PUBLICIDAD", "IMPUESTOS", "OTROS"] as const;

// Un gasto es de un día (no de una hora): se guarda al mediodía de Colombia
// para que ningún cambio de zona horaria lo pase al día vecino.
export const mediodiaDe = (dia: string) => new Date(`${dia}T12:00:00-05:00`);

const rangoSchema = z.object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) });

gastosRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const parsed = rangoSchema.safeParse(req.query);
    if (!parsed.success) throw new ErrorDeNegocio("Indica un rango de fechas válido (desde y hasta, formato AAAA-MM-DD)", 400);
    const { inicio, fin } = rangoDeDias(parsed.data.desde, parsed.data.hasta);
    // De la sede (o de todas, con los generales del negocio).
    const sedesIds = sedesDelReporte(req);
    const gastos = await prisma.gasto.findMany({
      where: { fecha: { gte: inicio, lt: fin }, ...(sedesIds ? { sedeId: { in: sedesIds } } : {}) },
      include: {
        registradoPor: { select: { nombre: true, apellido: true } },
        movimientoCaja: { select: { cierreCajaId: true } },
        sede: { select: { nombre: true } },
      },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    });
    const porCategoria = new Map<string, number>();
    for (const g of gastos) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.monto);
    res.json({
      gastos: gastos.map((g) => ({
        id: g.id,
        dia: diaLocal(g.fecha),
        categoria: g.categoria,
        concepto: g.concepto,
        monto: g.monto,
        esFijo: g.esFijo,
        desdeCaja: Boolean(g.movimientoCajaId),
        enCierre: Boolean(g.movimientoCaja?.cierreCajaId),
        registradoPor: nombreCompleto(g.registradoPor),
        // null = gasto general del negocio.
        sede: g.sede?.nombre ?? null,
      })),
      total: gastos.reduce((s, g) => s + g.monto, 0),
      porCategoria: Array.from(porCategoria, ([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
    });
  })
);

const nuevoSchema = z.object({
  dia: z.string().refine(esDiaValido),
  categoria: z.enum(CATEGORIAS),
  concepto: z.string().trim().min(3).max(200),
  monto: z.number().int().positive().max(1_000_000_000),
  esFijo: z.boolean().optional(),
  // Pagado con efectivo de la caja: sale del efectivo que debe haber al cerrar.
  desdeCaja: z.boolean().optional(),
  // Del negocio en general (no de una sede): solo el administrador general.
  general: z.boolean().optional(),
});

gastosRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = nuevoSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa el gasto: fecha, categoría, concepto (mínimo 3 letras) y valor", 400);
    const { dia, categoria, concepto, monto, esFijo = false, desdeCaja = false, general = false } = parsed.data;
    const hoy = diaLocal(new Date());
    if (dia > hoy) throw new ErrorDeNegocio("La fecha del gasto no puede ser futura", 400);
    // La salida de caja ocurre ahora, en el turno abierto: un gasto de otro
    // día pagado con la caja de ese día ya debió registrarse entonces.
    if (desdeCaja && dia !== hoy) throw new ErrorDeNegocio("Solo un gasto de hoy se puede descontar de la caja", 400);
    if (general && req.sedeFija) throw new ErrorDeNegocio("Solo el administrador general registra gastos generales del negocio", 403);
    if (general && desdeCaja) throw new ErrorDeNegocio("Un gasto general no sale de la caja de una sede", 400);
    const sedeId = general ? null : req.sedeId;

    const gasto = await prisma.$transaction(async (tx) => {
      const movimiento = desdeCaja
        ? await tx.movimientoCaja.create({ data: { sedeId: req.sedeId, tipo: "SALIDA", monto, concepto: `Gasto: ${concepto}`, registradoPorId: req.user!.userId } })
        : null;
      return tx.gasto.create({
        data: { sedeId, fecha: mediodiaDe(dia), categoria, concepto, monto, esFijo, movimientoCajaId: movimiento?.id ?? null, registradoPorId: req.user!.userId },
      });
    });
    res.status(201).json(gasto);
  })
);

// Para corregir un error; si salió de la caja, se borra también esa salida,
// siempre que la caja no se haya cerrado todavía.
gastosRouter.delete(
  "/:id",
  catchAsync(async (req, res) => {
    const gasto = await prisma.gasto.findUnique({ where: { id: req.params.id }, include: { movimientoCaja: true } });
    if (!gasto) throw new ErrorDeNegocio("Gasto no encontrado", 404);
    if (req.sedeFija && gasto.sedeId !== req.sedeId) throw new ErrorDeNegocio("Ese gasto es de otra sede", 403);
    if (gasto.movimientoCaja?.cierreCajaId) throw new ErrorDeNegocio("Este gasto salió de una caja que ya se cerró: no se puede borrar", 409);
    await prisma.$transaction(async (tx) => {
      await tx.gasto.delete({ where: { id: gasto.id } });
      if (gasto.movimientoCajaId) {
        const borrado = await tx.movimientoCaja.deleteMany({ where: { id: gasto.movimientoCajaId, cierreCajaId: null } });
        if (borrado.count === 0) throw new ErrorDeNegocio("La caja se cerró mientras tanto: ya no se puede borrar", 409);
      }
    });
    res.status(204).send();
  })
);
