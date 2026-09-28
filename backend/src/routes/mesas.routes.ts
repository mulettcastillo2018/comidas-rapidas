import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { emitMesaActualizada } from "../realtime/socket";

export const mesasRouter = Router();

const mesaInclude = { meseroAsignado: { select: { id: true, nombre: true, apellido: true } } };

// Por defecto solo las mesas activas (grilla del mesero, QR); el panel de
// admin pide también las desactivadas para poder reactivarlas.
mesasRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const incluirInactivas = req.query.incluirInactivas === "true" && req.user!.role === "ADMIN";
    const mesas = await prisma.mesa.findMany({
      where: incluirInactivas ? undefined : { activa: true },
      orderBy: { numero: "asc" },
      include: mesaInclude,
    });
    res.json(mesas);
  })
);

const mesaSchema = z.object({
  numero: z.string().trim().min(1),
  capacidad: z.number().int().positive(),
  meseroAsignadoId: z.string().min(1).nullable().optional(),
  activa: z.boolean().optional(),
});

async function validarNumeroDisponible(numero: string, excluirId?: string) {
  const existente = await prisma.mesa.findUnique({ where: { numero } });
  if (existente && existente.id !== excluirId) {
    throw new ErrorDeNegocio(
      existente.activa
        ? `Ya existe una mesa con el número ${numero}`
        : `La mesa ${numero} existe pero está desactivada — reactívala en vez de crearla de nuevo`,
      409
    );
  }
}

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
    await validarNumeroDisponible(parsed.data.numero);
    const mesa = await prisma.mesa.create({ data: parsed.data, include: mesaInclude });
    emitMesaActualizada(mesa);
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
    if (parsed.data.numero) await validarNumeroDisponible(parsed.data.numero, req.params.id);
    const mesa = await prisma.mesa.update({ where: { id: req.params.id }, data: parsed.data, include: mesaInclude });
    emitMesaActualizada(mesa);
    res.json(mesa);
  })
);

// Una mesa sin historial se borra; una con historial (sesiones, pedidos,
// facturas) solo se desactiva, porque borrarla rompería esos registros.
mesasRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const mesa = await prisma.mesa.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { sesiones: true, solicitudes: true } } },
    });
    if (!mesa) throw new ErrorDeNegocio("Mesa no encontrada", 404);
    if (mesa.estado === "OCUPADA") throw new ErrorDeNegocio("No puedes quitar una mesa que está ocupada", 409);

    if (mesa._count.sesiones === 0 && mesa._count.solicitudes === 0) {
      await prisma.mesa.delete({ where: { id: mesa.id } });
      emitMesaActualizada({ ...mesa, activa: false, eliminada: true });
      res.json({ eliminada: true });
      return;
    }
    const desactivada = await prisma.mesa.update({ where: { id: mesa.id }, data: { activa: false }, include: mesaInclude });
    emitMesaActualizada(desactivada);
    res.json({ eliminada: false, mesa: desactivada });
  })
);
