import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";

export const cajaRouter = Router();

type Cliente = Prisma.TransactionClient | typeof prisma;

// Lo que entra en el próximo cierre: toda cuenta cobrada o dada por perdida
// que todavía no pertenece a ningún cierre, sin importar la hora (así una
// cuenta cobrada justo mientras se cierra no queda por fuera de ambos turnos).
async function resumenSinCerrar(cliente: Cliente) {
  const [facturas, ultimoCierre] = await Promise.all([
    cliente.factura.findMany({
      where: { cierreCajaId: null, estado: { in: ["PAGADA", "PERDIDA"] } },
      select: { id: true, estado: true, metodoPago: true, total: true, propinaMonto: true, pagadaEn: true },
    }),
    cliente.cierreCaja.findFirst({ orderBy: { hasta: "desc" }, select: { hasta: true } }),
  ]);
  const pagadas = facturas.filter((f) => f.estado === "PAGADA");
  const perdidas = facturas.filter((f) => f.estado === "PERDIDA");
  const totalPor = (metodo: string) => pagadas.filter((f) => f.metodoPago === metodo).reduce((s, f) => s + f.total, 0);
  const primeraFecha = facturas.reduce<Date | null>((min, f) => (f.pagadaEn && (!min || f.pagadaEn < min) ? f.pagadaEn : min), null);

  return {
    facturaIds: facturas.map((f) => f.id),
    desde: ultimoCierre?.hasta ?? primeraFecha ?? new Date(),
    cuentasPagadas: pagadas.length,
    totalEfectivo: totalPor("EFECTIVO"),
    totalTarjeta: totalPor("TARJETA"),
    totalOtro: totalPor("OTRO"),
    propinas: pagadas.reduce((s, f) => s + f.propinaMonto, 0),
    cuentasPerdidas: perdidas.length,
    totalPerdidas: perdidas.reduce((s, f) => s + f.total, 0),
  };
}

cajaRouter.get(
  "/actual",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const [{ facturaIds: _ids, ...resumen }, mesasAbiertas, cuentasPorCobrar] = await Promise.all([
      resumenSinCerrar(prisma),
      prisma.mesaSesion.count({ where: { estado: { not: "CERRADA" } } }),
      prisma.factura.count({ where: { estado: "PENDIENTE" } }),
    ]);
    // Avisos, no bloqueos: el turno puede cerrarse con mesas aún abiertas;
    // lo que cobren después simplemente entra en el siguiente cierre.
    res.json({ ...resumen, mesasAbiertas, cuentasPorCobrar });
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
      const { facturaIds, ...resumen } = await resumenSinCerrar(tx);
      if (facturaIds.length === 0) throw new ErrorDeNegocio("No hay cuentas cobradas desde el último cierre.", 409);

      const creado = await tx.cierreCaja.create({
        data: {
          ...resumen,
          cerradoPorId: req.user!.userId,
          baseInicial,
          efectivoContado,
          diferencia: efectivoContado - (baseInicial + resumen.totalEfectivo),
          notas: notas || null,
        },
      });
      // Si otro admin cerró caja al mismo tiempo, estas cuentas ya quedaron
      // en su cierre: se deshace este para no contarlas dos veces.
      const asignadas = await tx.factura.updateMany({
        where: { id: { in: facturaIds }, cierreCajaId: null },
        data: { cierreCajaId: creado.id },
      });
      if (asignadas.count !== facturaIds.length) {
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
