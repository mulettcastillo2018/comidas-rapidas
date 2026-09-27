import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const productosRouter = Router();

productosRouter.get(
  "/",
  requireAuth,
  catchAsync(async (_req, res) => {
    const productos = await prisma.producto.findMany({
      where: { isActive: true },
      orderBy: { nombre: "asc" },
      include: { categoria: true },
    });
    res.json(productos);
  })
);

const productoSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().trim().min(1),
  precio: z.number().int().positive(),
  tiempoPreparacionMinutos: z.number().int().positive(),
  categoriaId: z.string().min(1),
  imagenUrl: z.string().trim().min(1).nullable().optional(),
  disponible: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

productosRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const producto = await prisma.producto.create({ data: parsed.data });
    res.status(201).json(producto);
  })
);

productosRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productoSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const producto = await prisma.producto.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(producto);
  })
);

productosRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.producto.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  })
);
