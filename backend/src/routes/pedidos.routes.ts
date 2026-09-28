import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { emitPedidoActualizado } from "../realtime/socket";
import { calcularEstadoPedido } from "../lib/pedidoAggregate";
import { enlaces, notificarUsuarios, notificarPorRol } from "../services/notificaciones";
import { crearPedido, pedidoInclude } from "../services/pedidos";

export const pedidosRouter = Router();

// El estado del pedido se recalcula a partir de todos sus productos; si dos
// productos del mismo pedido cambian a la vez, cada transacción vería al otro
// sin cambiar y el agregado quedaría viejo. Bloquear la fila del pedido hace
// que esos cambios se apliquen uno tras otro.
async function bloquearPedido(tx: Prisma.TransactionClient, pedidoId: string) {
  await tx.$queryRaw`SELECT id FROM "Pedido" WHERE id = ${pedidoId} FOR UPDATE`;
}

const pedidoItemSchema = z.object({
  comensalId: z.string().min(1).nullable().optional(),
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  notas: z.string().trim().min(1).nullable().optional(),
  paraLlevar: z.boolean().optional(),
});

const crearPedidoSchema = z.object({
  mesaSesionId: z.string().min(1),
  notasGenerales: z.string().trim().min(1).nullable().optional(),
  items: z.array(pedidoItemSchema).min(1),
});

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

    const pedidoCompleto = await crearPedido({ mesaSesionId, meseroId: req.user!.userId, notasGenerales, items });
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
    // Con mesa, el dueño es quien abrió la sesión; sin mesa (pedido de
    // mostrador), el dueño es directamente quien lo confirmó (el admin).
    const duenoPedidoId = pedido.mesaSesion?.meseroId ?? pedido.meseroId;
    if (duenoPedidoId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }

    const permitido = TRANSICIONES_PEDIDO_VALIDAS[pedido.estado] ?? [];
    if (!permitido.includes(estado)) {
      res.status(409).json({ error: `No se puede pasar de "${pedido.estado}" a "${estado}"` });
      return;
    }

    // Solo se tocan los productos que siguen en curso: los ya entregados se
    // consumieron (y se cobran) aunque se cancele el resto del pedido. Este
    // endpoint es el atajo para entregar/cancelar todo de una vez; producto
    // por producto va por PUT /:id/items/:itemId/estado, y ambos caminos
    // dejan el mismo rastro por producto (lo usa el reporte de cancelaciones).
    const enCurso = pedido.items.filter((i) => i.estado !== "ENTREGADO" && i.estado !== "CANCELADO");
    const yaEnCocina = estado === "CANCELADO" && enCurso.some((i) => i.estado === "EN_PREPARACION" || i.estado === "LISTO");

    await prisma.$transaction(async (tx) => {
      await bloquearPedido(tx, pedido.id);
      // Condicionado a que sigan en curso: si mientras tanto alguien entregó
      // uno de estos productos, se rechaza en vez de cancelar algo ya servido.
      const tomados = await tx.pedidoItem.updateMany({
        where: { id: { in: enCurso.map((i) => i.id) }, estado: { notIn: ["ENTREGADO", "CANCELADO"] } },
        data: { estado },
      });
      if (tomados.count !== enCurso.length) {
        throw new ErrorDeNegocio("El pedido cambió mientras tanto (alguien entregó o canceló un producto). Revisa y vuelve a intentarlo.", 409);
      }
      await tx.pedidoItemStatusLog.createMany({
        data: enCurso.map((i) => ({ pedidoItemId: i.id, deEstado: i.estado, aEstado: estado, cambiadoPorId: req.user!.userId })),
      });

      const nuevoEstado = calcularEstadoPedido(pedido.items.map((i) => (enCurso.includes(i) ? { estado } : i)));
      await tx.pedido.update({
        where: { id: pedido.id },
        data: { estado: nuevoEstado, ...(nuevoEstado === "ENTREGADO" && !pedido.entregadoEn ? { entregadoEn: new Date() } : {}) },
      });
      await tx.pedidoStatusLog.create({
        data: { pedidoId: pedido.id, deEstado: pedido.estado, aEstado: nuevoEstado, cambiadoPorId: req.user!.userId },
      });
    });

    const pedidoActualizado = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: pedidoInclude });
    emitPedidoActualizado(pedidoActualizado);
    if (yaEnCocina && pedidoActualizado) {
      const ubicacion = pedidoActualizado.mesaSesion
        ? `Mesa ${pedidoActualizado.mesaSesion.mesa.numero}`
        : `Mostrador — ${pedidoActualizado.nombreCliente ?? "cliente"}`;
      await notificarPorRol({
        rol: "COCINA",
        tipo: "ITEM_CANCELADO",
        mensaje: `Se canceló el pedido completo de ${ubicacion} (ya había productos en cocina)`,
        pedidoId: pedidoActualizado.id,
        enlace: enlaces.cocina(pedidoActualizado.id),
      });
    }
    res.json(pedidoActualizado);
  })
);

// Cocina despacha producto por producto (RECIBIDO->EN_PREPARACION->LISTO) y
// el mesero entrega producto por producto (LISTO->ENTREGADO) sin tener que
// esperar a que los demás productos del mismo pedido también estén listos.
const ESTADOS_ITEM_PERMITIDOS = ["EN_PREPARACION", "LISTO", "ENTREGADO", "CANCELADO"] as const;
const cambiarEstadoItemSchema = z.object({ estado: z.enum(ESTADOS_ITEM_PERMITIDOS) });

const TRANSICIONES_ITEM_VALIDAS: Record<string, string[]> = {
  RECIBIDO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO", "CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
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

    const item = await prisma.pedidoItem.findUnique({
      where: { id: req.params.itemId },
      include: { pedido: { include: { mesaSesion: true } } },
    });
    if (!item || item.pedidoId !== req.params.id) {
      res.status(404).json({ error: "Producto del pedido no encontrado" });
      return;
    }
    // Entregar y cancelar son acciones del mesero dueño de la mesa (o admin) —
    // cancelar es él quien decide si el cliente ya no quiere el producto.
    // Avanzar de recibido a en-preparación/listo lo hace cocina y no está
    // atado a una mesa en particular.
    const duenoItemId = item.pedido.mesaSesion?.meseroId ?? item.pedido.meseroId;
    if ((estado === "ENTREGADO" || estado === "CANCELADO") && duenoItemId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }

    const permitido = TRANSICIONES_ITEM_VALIDAS[item.estado] ?? [];
    if (!permitido.includes(estado)) {
      res.status(409).json({ error: `No se puede pasar de "${item.estado}" a "${estado}"` });
      return;
    }
    // Si ya estaba en preparación o lista, cocina invirtió tiempo/recursos en
    // ella — avisamos para que no se queden preparando o esperando algo que
    // el mesero ya canceló.
    const yaEstabaEnCocina = estado === "CANCELADO" && (item.estado === "EN_PREPARACION" || item.estado === "LISTO");

    const timestamps: Record<string, Date> = {};
    if (estado === "EN_PREPARACION") timestamps.iniciadoEn = new Date();
    if (estado === "LISTO") timestamps.listoEn = new Date();

    await prisma.$transaction(async (tx) => {
      await bloquearPedido(tx, item.pedidoId);
      // Solo si sigue en el estado que se leyó: si cocina y el mesero lo
      // cambian a la vez (p. ej. "listo" y "cancelado"), el segundo se rechaza.
      const cambiado = await tx.pedidoItem.updateMany({ where: { id: item.id, estado: item.estado }, data: { estado, ...timestamps } });
      if (cambiado.count === 0) throw new ErrorDeNegocio("Este producto cambió de estado mientras tanto. Actualiza e intenta de nuevo.", 409);
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
            ...(nuevoEstadoPedido === "ENTREGADO" ? { entregadoEn: new Date() } : {}),
          },
        });
        await tx.pedidoStatusLog.create({
          data: { pedidoId: item.pedidoId, deEstado: pedidoActual.estado, aEstado: nuevoEstadoPedido, cambiadoPorId: req.user!.userId },
        });
      }
    });

    const pedidoActualizado = await prisma.pedido.findUnique({ where: { id: item.pedidoId }, include: pedidoInclude });
    emitPedidoActualizado(pedidoActualizado);
    const ubicacion = pedidoActualizado?.mesaSesion
      ? `Mesa ${pedidoActualizado.mesaSesion.mesa.numero}`
      : `Mostrador — ${pedidoActualizado?.nombreCliente ?? "cliente"}`;
    if (estado === "LISTO" && pedidoActualizado) {
      const itemActualizado = pedidoActualizado.items.find((i) => i.id === item.id);
      // Sin mesa (pedido de mostrador) el dueño es el admin en caja, que ya
      // ve todo en su propio módulo — no hace falta notificarle esto aparte.
      if (pedidoActualizado.mesaSesion) {
        await notificarUsuarios({
          userIds: [pedidoActualizado.mesaSesion.meseroId],
          tipo: "ITEM_LISTO",
          mensaje: `${itemActualizado?.producto?.nombre ?? "Producto"} para ${ubicacion} está listo para entregar`,
          pedidoId: pedidoActualizado.id,
          pedidoItemId: item.id,
          enlace: enlaces.mesaAbierta(pedidoActualizado.mesaSesion.id, item.id),
        });
      }
    }
    if (yaEstabaEnCocina && pedidoActualizado) {
      const itemActualizado = pedidoActualizado.items.find((i) => i.id === item.id);
      await notificarPorRol({
        rol: "COCINA",
        tipo: "ITEM_CANCELADO",
        mensaje: `Se canceló ${itemActualizado?.producto?.nombre ?? "un producto"} de ${ubicacion} (ya estaba en cocina)`,
        pedidoId: pedidoActualizado.id,
        pedidoItemId: item.id,
        enlace: enlaces.cocina(pedidoActualizado.id),
      });
    }
    res.json(pedidoActualizado);
  })
);
