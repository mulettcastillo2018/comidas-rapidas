import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { emitPedidoNuevo, emitPedidoActualizado } from "../realtime/socket";
import { calcularEstadoPedido } from "../lib/pedidoAggregate";
import { notificarPorRol, notificarUsuarios } from "../services/notificaciones";

export const pedidosRouter = Router();

const pedidoItemSchema = z.object({
  comensalId: z.string().min(1).nullable().optional(),
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  notas: z.string().trim().min(1).nullable().optional(),
});

const crearPedidoSchema = z.object({
  mesaSesionId: z.string().min(1),
  notasGenerales: z.string().trim().min(1).nullable().optional(),
  items: z.array(pedidoItemSchema).min(1),
});

const pedidoInclude = {
  items: { include: { producto: true, comensal: true } },
  mesaSesion: { include: { mesa: true, mesero: { select: { id: true, name: true } } } },
  statusLogs: { include: { cambiadoPor: { select: { id: true, name: true, role: true } } }, orderBy: { cambiadoEn: "asc" as const } },
};

// Pedidos con al menos un ítem que la cocina todavía debe atender o que el
// mesero todavía debe entregar — alimenta la carga inicial del tablero de
// cocina (que opera producto por producto, no pedido por pedido).
pedidosRouter.get(
  "/activos",
  requireAuth,
  catchAsync(async (_req, res) => {
    const pedidos = await prisma.pedido.findMany({
      where: { estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] } },
      include: pedidoInclude,
      orderBy: { creadoEn: "asc" },
    });
    res.json(pedidos);
  })
);

pedidosRouter.post(
  "/",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = crearPedidoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { mesaSesionId, notasGenerales, items } = parsed.data;

    const sesion = await prisma.mesaSesion.findUnique({ where: { id: mesaSesionId } });
    if (!sesion) {
      res.status(404).json({ error: "Sesión de mesa no encontrada" });
      return;
    }
    if (sesion.estado !== "ABIERTA") {
      res.status(409).json({ error: "La mesa no está abierta para recibir pedidos" });
      return;
    }
    // Solo el mesero que abrió la mesa (o el admin) puede registrar pedidos
    // en ella: dos meseros no pueden atender la misma mesa.
    if (sesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }

    const productos = await prisma.producto.findMany({ where: { id: { in: items.map((i) => i.productoId) } } });
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    for (const item of items) {
      const producto = productosPorId.get(item.productoId);
      if (!producto || !producto.isActive) {
        res.status(400).json({ error: "Uno de los productos seleccionados ya no está disponible" });
        return;
      }
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const created = await tx.pedido.create({
        data: {
          mesaSesionId,
          meseroId: req.user!.userId,
          notasGenerales,
          items: {
            create: items.map((item) => {
              const producto = productosPorId.get(item.productoId)!;
              return {
                comensalId: item.comensalId ?? null,
                productoId: item.productoId,
                cantidad: item.cantidad,
                notas: item.notas ?? null,
                precioUnitario: producto.precio,
                tiempoPreparacionMinutos: producto.tiempoPreparacionMinutos,
              };
            }),
          },
          statusLogs: {
            create: { aEstado: "RECIBIDO", cambiadoPorId: req.user!.userId },
          },
        },
      });
      return created;
    });

    const pedidoCompleto = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: pedidoInclude });
    emitPedidoNuevo(pedidoCompleto);
    if (pedidoCompleto) {
      await notificarPorRol({
        rol: "COCINA",
        tipo: "PEDIDO_NUEVO",
        mensaje: `Nuevo pedido en Mesa ${pedidoCompleto.mesaSesion.mesa.numero} — ${pedidoCompleto.items.length} producto(s)`,
        pedidoId: pedidoCompleto.id,
      });
    }
    res.status(201).json(pedidoCompleto);
  })
);

// Transición a nivel de pedido: solo cubre la entrega al cliente (una vez
// TODOS sus productos están listos) y la cancelación del ticket completo.
// Avanzar producto por producto se hace en PUT /:id/items/:itemId/estado.
const ESTADOS_PEDIDO_PERMITIDOS = ["ENTREGADO", "CANCELADO"] as const;
const cambiarEstadoPedidoSchema = z.object({ estado: z.enum(ESTADOS_PEDIDO_PERMITIDOS) });

const TRANSICIONES_PEDIDO_VALIDAS: Record<string, string[]> = {
  RECIBIDO: ["CANCELADO"],
  EN_PREPARACION: ["CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
};

pedidosRouter.put(
  "/:id/estado",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = cambiarEstadoPedidoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { estado } = parsed.data;

    const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id }, include: { items: true, mesaSesion: true } });
    if (!pedido) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    if (pedido.mesaSesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }

    const permitido = TRANSICIONES_PEDIDO_VALIDAS[pedido.estado] ?? [];
    if (!permitido.includes(estado)) {
      res.status(409).json({ error: `No se puede pasar de "${pedido.estado}" a "${estado}"` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (estado === "CANCELADO") {
        await tx.pedidoItem.updateMany({ where: { pedidoId: pedido.id }, data: { estado: "CANCELADO" } });
      }
      await tx.pedido.update({
        where: { id: pedido.id },
        data: { estado, ...(estado === "ENTREGADO" ? { entregadoEn: new Date() } : {}) },
      });
      await tx.pedidoStatusLog.create({
        data: { pedidoId: pedido.id, deEstado: pedido.estado, aEstado: estado, cambiadoPorId: req.user!.userId },
      });
    });

    const pedidoActualizado = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: pedidoInclude });
    emitPedidoActualizado(pedidoActualizado);
    res.json(pedidoActualizado);
  })
);

// Cocina despacha producto por producto: este es el endpoint que realmente
// mueve el tablero de cocina.
const ESTADOS_ITEM_PERMITIDOS = ["EN_PREPARACION", "LISTO", "CANCELADO"] as const;
const cambiarEstadoItemSchema = z.object({ estado: z.enum(ESTADOS_ITEM_PERMITIDOS) });

const TRANSICIONES_ITEM_VALIDAS: Record<string, string[]> = {
  RECIBIDO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO", "CANCELADO"],
};

pedidosRouter.put(
  "/:id/items/:itemId/estado",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = cambiarEstadoItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { estado } = parsed.data;

    const item = await prisma.pedidoItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.pedidoId !== req.params.id) {
      res.status(404).json({ error: "Producto del pedido no encontrado" });
      return;
    }

    const permitido = TRANSICIONES_ITEM_VALIDAS[item.estado] ?? [];
    if (!permitido.includes(estado)) {
      res.status(409).json({ error: `No se puede pasar de "${item.estado}" a "${estado}"` });
      return;
    }

    const timestamps: Record<string, Date> = {};
    if (estado === "EN_PREPARACION") timestamps.iniciadoEn = new Date();
    if (estado === "LISTO") timestamps.listoEn = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.pedidoItem.update({ where: { id: item.id }, data: { estado, ...timestamps } });
      await tx.pedidoItemStatusLog.create({
        data: { pedidoItemId: item.id, deEstado: item.estado, aEstado: estado, cambiadoPorId: req.user!.userId },
      });

      // Recalcular el agregado del pedido a partir de sus ítems.
      const todosLosItems = await tx.pedidoItem.findMany({ where: { pedidoId: item.pedidoId } });
      const pedidoActual = await tx.pedido.findUniqueOrThrow({ where: { id: item.pedidoId } });
      const nuevoEstadoPedido = calcularEstadoPedido(todosLosItems);
      if (nuevoEstadoPedido !== pedidoActual.estado) {
        await tx.pedido.update({
          where: { id: item.pedidoId },
          data: {
            estado: nuevoEstadoPedido,
            ...(nuevoEstadoPedido === "EN_PREPARACION" && !pedidoActual.iniciadoEn ? { iniciadoEn: new Date() } : {}),
            ...(nuevoEstadoPedido === "LISTO" ? { listoEn: new Date() } : {}),
          },
        });
        await tx.pedidoStatusLog.create({
          data: { pedidoId: item.pedidoId, deEstado: pedidoActual.estado, aEstado: nuevoEstadoPedido, cambiadoPorId: req.user!.userId },
        });
      }
    });

    const pedidoActualizado = await prisma.pedido.findUnique({ where: { id: item.pedidoId }, include: pedidoInclude });
    emitPedidoActualizado(pedidoActualizado);
    if (estado === "LISTO" && pedidoActualizado) {
      const itemActualizado = pedidoActualizado.items.find((i) => i.id === item.id);
      await notificarUsuarios({
        userIds: [pedidoActualizado.mesaSesion.meseroId],
        tipo: "ITEM_LISTO",
        mensaje: `${itemActualizado?.producto?.nombre ?? "Producto"} para Mesa ${pedidoActualizado.mesaSesion.mesa.numero} está listo para entregar`,
        pedidoId: pedidoActualizado.id,
        pedidoItemId: item.id,
      });
    }
    res.json(pedidoActualizado);
  })
);
