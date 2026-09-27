import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const mesaSesionesRouter = Router();

const sesionInclude = {
  mesa: true,
  mesero: { select: { id: true, name: true } },
  comensales: true,
  pedidos: {
    include: {
      items: { include: { producto: true, comensal: true } },
      mesaSesion: { include: { mesa: true, mesero: { select: { id: true, name: true } } } },
    },
    orderBy: { creadoEn: "asc" as const },
  },
  factura: true,
};

mesaSesionesRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const soloActivas = req.query.activas !== "false";
    const sesiones = await prisma.mesaSesion.findMany({
      where: soloActivas ? { estado: { not: "CERRADA" } } : undefined,
      include: sesionInclude,
      orderBy: { abiertaEn: "desc" },
    });
    res.json(sesiones);
  })
);

mesaSesionesRouter.get(
  "/:id",
  requireAuth,
  catchAsync(async (req, res) => {
    const sesion = await prisma.mesaSesion.findUnique({
      where: { id: req.params.id },
      include: sesionInclude,
    });
    if (!sesion) {
      res.status(404).json({ error: "Sesión de mesa no encontrada" });
      return;
    }
    res.json(sesion);
  })
);

const abrirMesaSchema = z.object({
  mesaId: z.string().min(1),
  nombreResponsable: z.string().trim().min(1),
  comensales: z.array(z.string().trim().min(1)).min(1),
  confirmaSillaExtra: z.boolean().optional().default(false),
});

mesaSesionesRouter.post(
  "/",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = abrirMesaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { mesaId, nombreResponsable, comensales, confirmaSillaExtra } = parsed.data;

    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!mesa) {
      res.status(404).json({ error: "Mesa no encontrada" });
      return;
    }
    if (mesa.estado !== "LIBRE") {
      res.status(409).json({ error: "La mesa ya está ocupada" });
      return;
    }
    // Dos meseros no pueden atender la misma mesa: si el admin la dejó
    // asignada a alguien específico, solo ese mesero (o el admin) puede abrirla.
    if (mesa.meseroAsignadoId && mesa.meseroAsignadoId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa está asignada a otro mesero" });
      return;
    }
    // Si se supera la capacidad de la mesa, el mesero debe confirmar
    // explícitamente que va a traer una silla adicional (de otra mesa o de
    // bodega) — no se permite superar el aforo por accidente.
    const sillasAdicionales = Math.max(0, comensales.length - mesa.capacidad);
    if (sillasAdicionales > 0 && !confirmaSillaExtra) {
      res.status(400).json({
        error: `Esta mesa tiene capacidad para ${mesa.capacidad}. Confirma si vas a agregar ${sillasAdicionales} silla(s) adicional(es) de otra mesa o de bodega.`,
      });
      return;
    }

    const sesion = await prisma.$transaction(async (tx) => {
      const created = await tx.mesaSesion.create({
        data: {
          mesaId,
          meseroId: req.user!.userId,
          nombreResponsable,
          sillasAdicionales,
          comensales: { create: comensales.map((nombre) => ({ nombre })) },
        },
      });
      await tx.mesa.update({ where: { id: mesaId }, data: { estado: "OCUPADA" } });
      return created;
    });

    const sesionCompleta = await prisma.mesaSesion.findUnique({ where: { id: sesion.id }, include: sesionInclude });
    res.status(201).json(sesionCompleta);
  })
);
