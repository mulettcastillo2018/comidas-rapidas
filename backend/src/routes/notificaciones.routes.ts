import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const notificacionesRouter = Router();

notificacionesRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const notificaciones = await prisma.notificacion.findMany({
      where: { userId: req.user!.userId },
      orderBy: { creadaEn: "desc" },
      take: 50,
    });
    res.json(notificaciones);
  })
);

notificacionesRouter.put(
  "/leer-todas",
  requireAuth,
  catchAsync(async (req, res) => {
    await prisma.notificacion.updateMany({
      where: { userId: req.user!.userId, leida: false },
      data: { leida: true },
    });
    res.json({ ok: true });
  })
);

notificacionesRouter.put(
  "/:id/leida",
  requireAuth,
  catchAsync(async (req, res) => {
    const notificacion = await prisma.notificacion.findUnique({ where: { id: req.params.id } });
    if (!notificacion || notificacion.userId !== req.user!.userId) {
      res.status(404).json({ error: "Notificación no encontrada" });
      return;
    }
    const actualizada = await prisma.notificacion.update({ where: { id: notificacion.id }, data: { leida: true } });
    res.json(actualizada);
  })
);
