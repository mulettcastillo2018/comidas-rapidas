import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { emitMesaSesionCerrada } from "../realtime/socket";

export const facturasRouter = Router();

const generarFacturaSchema = z.object({
  mesaSesionId: z.string().min(1),
  propinaMonto: z.number().int().min(0).optional(),
});

facturasRouter.post(
  "/",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = generarFacturaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { mesaSesionId, propinaMonto = 0 } = parsed.data;

    const sesion = await prisma.mesaSesion.findUnique({
      where: { id: mesaSesionId },
      include: { pedidos: { include: { items: true } }, factura: true },
    });
    if (!sesion) {
      res.status(404).json({ error: "Sesión de mesa no encontrada" });
      return;
    }
    if (sesion.estado === "CERRADA") {
      res.status(409).json({ error: "Esta mesa ya fue cerrada" });
      return;
    }
    if (sesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }
    if (sesion.factura) {
      res.status(409).json({ error: "Esta mesa ya tiene una factura generada" });
      return;
    }

    // Filtramos por ítem, no por pedido: un pedido puede tener una
    // cancelación parcial (ej. se canceló una pizza porque alguien de la mesa
    // se fue) sin que el ticket completo quede CANCELADO, y esos productos
    // cancelados no se deben cobrar.
    const items = sesion.pedidos.flatMap((p) => p.items).filter((item) => item.estado !== "CANCELADO");
    if (items.length === 0) {
      res.status(400).json({ error: "No hay pedidos para facturar en esta mesa" });
      return;
    }
    const subtotal = items.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0);
    const total = subtotal + propinaMonto;

    const factura = await prisma.$transaction(async (tx) => {
      const created = await tx.factura.create({
        data: { mesaSesionId, subtotal, propinaMonto, total },
      });
      await tx.mesaSesion.update({ where: { id: mesaSesionId }, data: { estado: "CUENTA_SOLICITADA" } });
      return created;
    });

    res.status(201).json(factura);
  })
);

const pagarFacturaSchema = z.object({ metodoPago: z.enum(["EFECTIVO", "TARJETA", "OTRO"]) });

facturasRouter.put(
  "/:id/pagar",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = pagarFacturaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const factura = await prisma.factura.findUnique({ where: { id: req.params.id }, include: { mesaSesion: true } });
    if (!factura) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }
    if (!factura.mesaSesion) {
      res.status(400).json({ error: "Esta factura es de un pedido de mostrador, no de una mesa" });
      return;
    }
    if (factura.mesaSesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }
    if (factura.estado === "PAGADA") {
      res.status(409).json({ error: "Esta factura ya está pagada" });
      return;
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      const updated = await tx.factura.update({
        where: { id: factura.id },
        data: { estado: "PAGADA", metodoPago: parsed.data.metodoPago, pagadaEn: new Date(), cerradaPorId: req.user!.userId },
      });
      const sesion = await tx.mesaSesion.update({
        where: { id: factura.mesaSesion!.id },
        data: { estado: "CERRADA", cerradaEn: new Date() },
      });
      await tx.mesa.update({ where: { id: sesion.mesaId }, data: { estado: "LIBRE" } });
      return updated;
    });

    emitMesaSesionCerrada({ mesaId: factura.mesaSesion.mesaId, sesionId: factura.mesaSesion.id });
    res.json(actualizada);
  })
);

// Cliente se fue sin pagar (o se decide no cobrar): deja constancia de la
// pérdida en vez de forzar a marcarla "pagada" (que sería falso) o dejar la
// mesa atascada para siempre esperando un pago que no va a llegar.
facturasRouter.put(
  "/:id/marcar-perdida",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const factura = await prisma.factura.findUnique({ where: { id: req.params.id }, include: { mesaSesion: true } });
    if (!factura) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }
    if (!factura.mesaSesion) {
      res.status(400).json({ error: "Esta factura es de un pedido de mostrador, no de una mesa" });
      return;
    }
    if (factura.mesaSesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }
    if (factura.estado !== "PENDIENTE") {
      res.status(409).json({ error: "Esta factura ya fue resuelta" });
      return;
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      const updated = await tx.factura.update({
        where: { id: factura.id },
        data: { estado: "PERDIDA", pagadaEn: new Date(), cerradaPorId: req.user!.userId },
      });
      const sesion = await tx.mesaSesion.update({
        where: { id: factura.mesaSesion!.id },
        data: { estado: "CERRADA", cerradaEn: new Date() },
      });
      await tx.mesa.update({ where: { id: sesion.mesaId }, data: { estado: "LIBRE" } });
      return updated;
    });

    emitMesaSesionCerrada({ mesaId: factura.mesaSesion.mesaId, sesionId: factura.mesaSesion.id });
    res.json(actualizada);
  })
);
