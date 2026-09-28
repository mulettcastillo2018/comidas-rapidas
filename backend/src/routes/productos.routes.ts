import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { uploadImagenProducto } from "../lib/upload";
import { emitProductoActualizado } from "../realtime/socket";

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
  requiereCocina: z.boolean().default(true),
  disponible: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

// "Agotado" lo decide quien ve la nevera y los insumos: cocina (o el admin).
productosRouter.put(
  "/:id/disponible",
  requireAuth,
  catchAsync(async (req, res) => {
    if (req.user!.role !== "COCINA" && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Solo cocina o el administrador pueden marcar productos agotados" });
      return;
    }
    const parsed = z.object({ disponible: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica si el producto está disponible (true/false)" });
      return;
    }
    const producto = await prisma.producto.update({
      where: { id: req.params.id },
      data: { disponible: parsed.data.disponible },
      include: { categoria: true },
    });
    emitProductoActualizado(producto);
    res.json(producto);
  })
);

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
    const producto = await prisma.producto.update({ where: { id: req.params.id }, data: parsed.data, include: { categoria: true } });
    emitProductoActualizado(producto);
    res.json(producto);
  })
);

productosRouter.post(
  "/:id/imagen",
  requireAuth,
  requireAdmin,
  uploadImagenProducto.single("imagen"),
  catchAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ninguna imagen" });
      return;
    }
    const imagenUrl = `/uploads/productos/${req.file.filename}`;
    const producto = await prisma.producto.update({ where: { id: req.params.id }, data: { imagenUrl } });
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
