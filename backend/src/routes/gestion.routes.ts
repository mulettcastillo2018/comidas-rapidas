import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { esDiaValido } from "../lib/fechas";
import { estadoDeResultados } from "../services/resultados";
import { obtenerConfiguracion, repartoDePropinas } from "../services/propinas";

// Reportes de gestión (estado de resultados, reparto de propinas) y los
// ajustes del negocio. Se montan en /reportes y /configuracion.
export const reportesGestionRouter = Router();
export const configuracionRouter = Router();
reportesGestionRouter.use(requireAuth, requireAdmin);
configuracionRouter.use(requireAuth, requireAdmin);

const MAX_DIAS = 366;
const rangoSchema = z
  .object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) })
  .refine((r) => r.desde <= r.hasta)
  .refine((r) => (new Date(r.hasta).getTime() - new Date(r.desde).getTime()) / 86_400_000 < MAX_DIAS);

function rango(query: unknown) {
  const parsed = rangoSchema.safeParse(query);
  if (!parsed.success) throw new ErrorDeNegocio(`Indica un rango de fechas válido (máximo ${MAX_DIAS} días)`, 400);
  return parsed.data;
}

reportesGestionRouter.get(
  "/resultados",
  catchAsync(async (req, res) => {
    const { desde, hasta } = rango(req.query);
    res.json(await estadoDeResultados(desde, hasta));
  })
);

reportesGestionRouter.get(
  "/propinas",
  catchAsync(async (req, res) => {
    const { desde, hasta } = rango(req.query);
    res.json(await repartoDePropinas(desde, hasta));
  })
);

const configuracionSchema = z.object({
  propinaPctCocina: z.number().int().min(0).max(100),
  propinaModo: z.enum(["PROPIAS", "POZO"]),
});

configuracionRouter.get(
  "/",
  catchAsync(async (_req, res) => {
    const { id: _id, ...config } = await obtenerConfiguracion();
    res.json(config);
  })
);

configuracionRouter.put(
  "/",
  catchAsync(async (req, res) => {
    const parsed = configuracionSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("El porcentaje para cocina va de 0 a 100", 400);
    const { id: _id, ...config } = await prisma.configuracion.upsert({ where: { id: "unica" }, create: parsed.data, update: parsed.data });
    res.json(config);
  })
);
