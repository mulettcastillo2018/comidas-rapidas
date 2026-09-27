import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const mesasRouter = Router();

const mesaInclude = { meseroAsignado: { select: { id: true, name: true } } };

mesasRouter.get(
  "/",
  requireAuth,
  catchAsync(async (_req, res) => {
    const mesas = await prisma.mesa.findMany({ orderBy: { numero: "asc" }, include: mesaInclude });
    res.json(mesas);
  })
);

const mesaSchema = z.object({
  numero: z.string().trim().min(1),
  capacidad: z.number().int().positive(),
  meseroAsignadoId: z.string().min(1).nullable().optional(),
});

mesasRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = mesaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const mesa = await prisma.mesa.create({ data: parsed.data, include: mesaInclude });
    res.status(201).json(mesa);
  })
);

mesasRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = mesaSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const mesa = await prisma.mesa.update({ where: { id: req.params.id }, data: parsed.data, include: mesaInclude });
    res.json(mesa);
  })
);

mesasRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.mesa.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
