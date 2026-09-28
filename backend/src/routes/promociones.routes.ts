import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { estaVigente } from "../services/promociones";

export const promocionesRouter = Router();

promocionesRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const promociones = await prisma.promocion.findMany({ orderBy: { creadoEn: "desc" } });
    const ahora = new Date();
    // "vigente": aplica en este preciso momento (día y hora).
    res.json(promociones.map((p) => ({ ...p, vigente: estaVigente(p, ahora) })));
  })
);

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");
const promocionSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    descuentoPct: z.number().int().min(1).max(100),
    activa: z.boolean().optional(),
    diasSemana: z.array(z.number().int().min(0).max(6)).default([]),
    horaInicio: hora.nullable().optional(),
    horaFin: hora.nullable().optional(),
    desde: z.coerce.date().nullable().optional(),
    hasta: z.coerce.date().nullable().optional(),
    productoIds: z.array(z.string().min(1)).default([]),
    categoriaIds: z.array(z.string().min(1)).default([]),
  })
  .refine((p) => p.productoIds.length + p.categoriaIds.length > 0, { message: "Elige al menos un producto o una categoría" });

function errorLegible(error: z.ZodError) {
  const { formErrors, fieldErrors } = error.flatten();
  return formErrors[0] ?? Object.values(fieldErrors).flat()[0] ?? "Revisa los datos de la promoción";
}

promocionesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = promocionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: errorLegible(parsed.error) });
      return;
    }
    res.status(201).json(await prisma.promocion.create({ data: parsed.data }));
  })
);

promocionesRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = promocionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: errorLegible(parsed.error) });
      return;
    }
    res.json(await prisma.promocion.update({ where: { id: req.params.id }, data: parsed.data }));
  })
);

// Las ventas ya hechas guardan el nombre de la promoción: borrarla no las altera.
promocionesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.promocion.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
