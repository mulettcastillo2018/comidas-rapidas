import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const adicionesRouter = Router();

// Adiciones (extra queso +$2.000, sin cebolla, término medio) y a qué
// productos se les pueden poner.
adicionesRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const adiciones = await prisma.adicion.findMany({ orderBy: { nombre: "asc" }, include: { productos: { select: { productoId: true } } } });
    const esAdmin = req.user!.role === "ADMIN";
    res.json(
      adiciones.map(({ productos, costo, ...a }) => ({
        ...a,
        // El costo solo lo ve el admin.
        ...(esAdmin ? { costo } : {}),
        productoIds: productos.map((p) => p.productoId),
      }))
    );
  })
);

const adicionSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  precio: z.number().int().min(0),
  costo: z.number().int().min(0).nullable().optional(),
  activa: z.boolean().optional(),
  productoIds: z.array(z.string().min(1)).default([]),
});

adicionesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = adicionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisa el nombre y el precio de la adición (0 si no tiene costo para el cliente)" });
      return;
    }
    const { productoIds, ...datos } = parsed.data;
    const adicion = await prisma.adicion.create({
      data: { ...datos, productos: { create: productoIds.map((productoId) => ({ productoId })) } },
    });
    res.status(201).json({ ...adicion, productoIds });
  })
);

adicionesRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = adicionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisa los datos de la adición" });
      return;
    }
    const { productoIds, ...datos } = parsed.data;
    const adicion = await prisma.$transaction(async (tx) => {
      const actualizada = await tx.adicion.update({ where: { id: req.params.id }, data: datos });
      if (productoIds) {
        await tx.productoAdicion.deleteMany({ where: { adicionId: actualizada.id } });
        await tx.productoAdicion.createMany({ data: productoIds.map((productoId) => ({ productoId, adicionId: actualizada.id })) });
      }
      return actualizada;
    });
    const productos = await prisma.productoAdicion.findMany({ where: { adicionId: adicion.id }, select: { productoId: true } });
    res.json({ ...adicion, productoIds: productos.map((p) => p.productoId) });
  })
);
