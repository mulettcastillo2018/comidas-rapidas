import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { CATEGORY_ICON_NAMES } from "../lib/categoryIcons";

export const categoriasRouter = Router();

categoriasRouter.get(
  "/",
  requireAuth,
  catchAsync(async (_req, res) => {
    const categorias = await prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
    res.json(categorias);
  })
);

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  icono: z.enum(CATEGORY_ICON_NAMES).nullable().optional(),
});

categoriasRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = categoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const categoria = await prisma.categoria.create({ data: parsed.data });
    res.status(201).json(categoria);
  })
);

categoriasRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = categoriaSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const categoria = await prisma.categoria.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(categoria);
  })
);

categoriasRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.categoria.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
