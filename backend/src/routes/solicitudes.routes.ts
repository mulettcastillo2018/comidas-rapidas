import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { crearPedido, CrearPedidoError } from "../services/pedidos";
import { notificarPorRol, notificarUsuarios } from "../services/notificaciones";
import { emitSolicitudNueva, emitSolicitudActualizada } from "../realtime/socket";

export const solicitudesRouter = Router();

const solicitudInclude = {
  mesa: { select: { id: true, numero: true } },
  items: { include: { producto: true } },
  resueltaPor: { select: { id: true, nombre: true, apellido: true } },
};

const solicitudItemSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  notas: z.string().trim().min(1).nullable().optional(),
  paraLlevar: z.boolean().optional(),
});

// mesaId ausente = pedido de mostrador (QR general, sin mesa detrás): el
// cliente no encontró puesto y decide pedir para recoger. En ese caso, como
// no hay mesero ni mesa vigilando el pedido, nombreCliente y telefonoCliente
// son obligatorios para poder identificarlo y avisarle.
const crearSolicitudSchema = z
  .object({
    mesaId: z.string().min(1).nullable().optional(),
    nombreCliente: z.string().trim().min(1).nullable().optional(),
    telefonoCliente: z.string().trim().min(1).nullable().optional(),
    items: z.array(solicitudItemSchema).min(1),
  })
  .refine((data) => data.mesaId || (data.nombreCliente && data.telefonoCliente), {
    message: "Sin mesa, el nombre y el teléfono del cliente son obligatorios",
  });

// Público (sin auth): el cliente arma su pedido desde la carta pública, ya
// sea escaneando el QR de su mesa o el QR general de mostrador. Esto NO crea
// un Pedido real todavía — solo una sugerencia pendiente que el mesero (si
// hay mesa) o el admin en caja (si no la hay) debe confirmar antes de que
// llegue a cocina.
solicitudesRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = crearSolicitudSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { mesaId, nombreCliente, telefonoCliente, items } = parsed.data;

    const mesa = mesaId ? await prisma.mesa.findUnique({ where: { id: mesaId } }) : null;
    if (mesaId && !mesa) {
      res.status(404).json({ error: "Mesa no encontrada" });
      return;
    }

    const productos = await prisma.producto.findMany({ where: { id: { in: items.map((i) => i.productoId) } } });
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    for (const item of items) {
      const producto = productosPorId.get(item.productoId);
      if (!producto || !producto.isActive || !producto.disponible) {
        res.status(400).json({ error: "Uno de los productos seleccionados ya no está disponible" });
        return;
      }
    }

    const solicitud = await prisma.solicitudPedido.create({
      data: {
        mesaId: mesaId ?? null,
        nombreCliente: nombreCliente ?? null,
        telefonoCliente: telefonoCliente ?? null,
        items: {
          create: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            notas: item.notas ?? null,
            paraLlevar: item.paraLlevar ?? false,
          })),
        },
      },
      include: solicitudInclude,
    });

    if (mesa) {
      // Avisa de inmediato al mesero correspondiente (el asignado a la mesa,
      // o a todos los meseros activos si la mesa está libre) — así no se
      // queda esperando en silencio hasta que alguien abra la mesa.
      const mensaje = `Mesa ${mesa.numero}: el cliente ya dejó listo su pedido para cuando llegues.`;
      if (mesa.meseroAsignadoId) {
        await notificarUsuarios({ userIds: [mesa.meseroAsignadoId], tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje });
      } else {
        await notificarPorRol({ rol: "MESERO", tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje });
      }
    } else {
      // Pedido de mostrador: lo atiende el admin en caja.
      await notificarPorRol({
        rol: "ADMIN",
        tipo: "SOLICITUD_PEDIDO_CLIENTE",
        mensaje: `Pedido de mostrador de ${nombreCliente} esperando en caja.`,
      });
    }
    emitSolicitudNueva(solicitud);

    res.status(201).json(solicitud);
  })
);

const estadoQuerySchema = z.enum(["PENDIENTE", "CONFIRMADA", "DESCARTADA"]).optional();

solicitudesRouter.get(
  "/",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const estadoParsed = estadoQuerySchema.safeParse(req.query.estado);
    const estado = estadoParsed.success ? (estadoParsed.data ?? "PENDIENTE") : "PENDIENTE";
    const mesaId = typeof req.query.mesaId === "string" ? req.query.mesaId : undefined;

    const solicitudes = await prisma.solicitudPedido.findMany({
      where: { estado, ...(mesaId ? { mesaId } : {}) },
      include: solicitudInclude,
      orderBy: { creadaEn: "asc" },
    });
    res.json(solicitudes);
  })
);

solicitudesRouter.put(
  "/:id/confirmar",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const solicitud = await prisma.solicitudPedido.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!solicitud) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    if (solicitud.estado !== "PENDIENTE") {
      res.status(409).json({ error: "Esta solicitud ya fue resuelta" });
      return;
    }
    if (!solicitud.mesaId) {
      res.status(400).json({ error: "Esta es una solicitud de mostrador — usa PUT /:id/confirmar-recogida" });
      return;
    }

    const sesion = await prisma.mesaSesion.findFirst({ where: { mesaId: solicitud.mesaId, estado: "ABIERTA" } });
    if (!sesion) {
      res.status(409).json({ error: "Primero debes abrir la mesa antes de confirmar el pedido del cliente" });
      return;
    }
    if (sesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }

    try {
      const pedidoCompleto = await crearPedido({
        mesaSesionId: sesion.id,
        meseroId: req.user!.userId,
        items: solicitud.items.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          notas: item.notas,
          paraLlevar: item.paraLlevar,
        })),
        origenCliente: true,
      });

      const solicitudActualizada = await prisma.solicitudPedido.update({
        where: { id: solicitud.id },
        data: { estado: "CONFIRMADA", resueltaEn: new Date(), resueltaPorId: req.user!.userId, pedidoId: pedidoCompleto!.id },
        include: solicitudInclude,
      });
      emitSolicitudActualizada(solicitudActualizada);
      res.json({ solicitud: solicitudActualizada, pedido: pedidoCompleto });
    } catch (err) {
      if (err instanceof CrearPedidoError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  })
);

const confirmarRecogidaSchema = z.object({ metodoPago: z.enum(["EFECTIVO", "TARJETA", "OTRO"]) });

// Pedido de mostrador (sin mesa): lo confirma el admin en caja, y como está
// físicamente con el cliente en ese momento, cobra ahí mismo en el mismo
// paso — así el cliente solo tiene que volver una vez, a recoger.
solicitudesRouter.put(
  "/:id/confirmar-recogida",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = confirmarRecogidaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const solicitud = await prisma.solicitudPedido.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!solicitud) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    if (solicitud.estado !== "PENDIENTE") {
      res.status(409).json({ error: "Esta solicitud ya fue resuelta" });
      return;
    }
    if (solicitud.mesaId) {
      res.status(400).json({ error: "Esta solicitud es de una mesa — usa PUT /:id/confirmar" });
      return;
    }

    try {
      const pedidoCompleto = await crearPedido({
        meseroId: req.user!.userId,
        nombreCliente: solicitud.nombreCliente,
        telefonoCliente: solicitud.telefonoCliente,
        items: solicitud.items.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          notas: item.notas,
        })),
        origenCliente: true,
      });
      if (!pedidoCompleto) throw new Error("No se pudo crear el pedido de mostrador");

      const subtotal = pedidoCompleto.items.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0);
      const factura = await prisma.factura.create({
        data: {
          pedidoId: pedidoCompleto.id,
          subtotal,
          total: subtotal,
          estado: "PAGADA",
          metodoPago: parsed.data.metodoPago,
          pagadaEn: new Date(),
          cerradaPorId: req.user!.userId,
        },
      });

      const solicitudActualizada = await prisma.solicitudPedido.update({
        where: { id: solicitud.id },
        data: { estado: "CONFIRMADA", resueltaEn: new Date(), resueltaPorId: req.user!.userId, pedidoId: pedidoCompleto.id },
        include: solicitudInclude,
      });
      emitSolicitudActualizada(solicitudActualizada);
      res.json({ solicitud: solicitudActualizada, pedido: pedidoCompleto, factura });
    } catch (err) {
      if (err instanceof CrearPedidoError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  })
);

solicitudesRouter.put(
  "/:id/descartar",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const solicitud = await prisma.solicitudPedido.findUnique({ where: { id: req.params.id } });
    if (!solicitud) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    if (solicitud.estado !== "PENDIENTE") {
      res.status(409).json({ error: "Esta solicitud ya fue resuelta" });
      return;
    }
    const actualizada = await prisma.solicitudPedido.update({
      where: { id: solicitud.id },
      data: { estado: "DESCARTADA", resueltaEn: new Date(), resueltaPorId: req.user!.userId },
      include: solicitudInclude,
    });
    emitSolicitudActualizada(actualizada);
    res.json(actualizada);
  })
);
