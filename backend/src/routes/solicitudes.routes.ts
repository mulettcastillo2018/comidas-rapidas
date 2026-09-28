import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMesero, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { crearLimitador } from "../lib/limitador";
import { crearPedidoEnTx, anunciarPedidoNuevo } from "../services/pedidos";
import { enlaces, notificarPorRol, notificarUsuarios } from "../services/notificaciones";
import { emitSolicitudNueva, emitSolicitudActualizada } from "../realtime/socket";

export const solicitudesRouter = Router();

const MAX_PENDIENTES_POR_MESA = 5;
const MAX_PENDIENTES_MOSTRADOR = 15;
// Amplio a propósito: solo frena envíos automatizados masivos.
const limitadorPorIp = crearLimitador(30, 10 * 60_000);

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
    aceptaDatos: z.boolean().optional(),
    items: z.array(solicitudItemSchema).min(1),
  })
  .refine((data) => data.mesaId || (data.nombreCliente && data.telefonoCliente), {
    message: "Sin mesa, el nombre y el teléfono del cliente son obligatorios",
  })
  .refine((data) => data.mesaId || data.aceptaDatos === true, {
    message: "Debes autorizar el uso de tu nombre y teléfono para que podamos avisarte de tu pedido",
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
      // Mensaje legible: esto lo ve el cliente en la carta pública.
      const { formErrors } = parsed.error.flatten();
      res.status(400).json({ error: formErrors[0] ?? "Revisa tu pedido: faltan datos o hay algo inválido." });
      return;
    }
    const { mesaId, nombreCliente, telefonoCliente, items } = parsed.data;

    const ip = req.ip ?? "desconocida";
    if (limitadorPorIp.excedido(ip)) {
      res.status(429).json({ error: "Demasiados pedidos seguidos desde este dispositivo. Espera unos minutos." });
      return;
    }

    const mesa = mesaId ? await prisma.mesa.findUnique({ where: { id: mesaId } }) : null;
    if (mesaId && (!mesa || !mesa.activa)) {
      res.status(404).json({ error: "Este código QR ya no corresponde a una mesa en servicio. Pídele al mesero que tome tu pedido." });
      return;
    }

    // Protección principal contra pedidos falsos: un tope de solicitudes sin
    // confirmar por mesa (o en caja). No depende de la IP, que en el wifi del
    // local puede ser la misma para todos los clientes.
    const pendientes = await prisma.solicitudPedido.count({ where: { mesaId: mesaId ?? null, estado: "PENDIENTE" } });
    const tope = mesaId ? MAX_PENDIENTES_POR_MESA : MAX_PENDIENTES_MOSTRADOR;
    if (pendientes >= tope) {
      res.status(429).json({
        error: mesaId
          ? "Esta mesa ya tiene varios pedidos esperando que el mesero los confirme. Espera a que llegue."
          : "Hay muchos pedidos esperando en caja. Acércate a caja para que te atiendan.",
      });
      return;
    }
    limitadorPorIp.registrar(ip);

    const productos = await prisma.producto.findMany({ where: { id: { in: items.map((i) => i.productoId) } } });
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    for (const item of items) {
      const producto = productosPorId.get(item.productoId);
      if (!producto || !producto.isActive) {
        res.status(400).json({ error: "Uno de los productos seleccionados ya no está en la carta. Recarga la página." });
        return;
      }
      if (!producto.disponible) {
        res.status(409).json({ error: `${producto.nombre} se agotó hace un momento. Quítalo de tu pedido o elige otra cosa.` });
        return;
      }
    }

    const solicitud = await prisma.solicitudPedido.create({
      data: {
        mesaId: mesaId ?? null,
        nombreCliente: nombreCliente ?? null,
        telefonoCliente: mesaId ? null : (telefonoCliente ?? null),
        codigoSeguimiento: randomBytes(9).toString("base64url"),
        datosAutorizadosEn: mesaId ? null : new Date(),
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
      // Avisa de inmediato al mesero correspondiente — así no se queda
      // esperando en silencio. Si la mesa ya está abierta, solo a quien la
      // atiende (y el aviso lo lleva directo a esa mesa); si no, al asignado
      // o a todos los meseros, y el aviso los lleva a la grilla.
      const sesionAbierta = await prisma.mesaSesion.findFirst({ where: { mesaId: mesa.id, estado: { not: "CERRADA" } } });
      const tipo = "SOLICITUD_PEDIDO_CLIENTE" as const;
      if (sesionAbierta) {
        await notificarUsuarios({
          userIds: [sesionAbierta.meseroId],
          tipo,
          mensaje: `Mesa ${mesa.numero}: el cliente agregó un pedido desde el QR. Revísalo y confírmalo.`,
          enlace: enlaces.mesaAbierta(sesionAbierta.id),
        });
      } else {
        const mensaje = `Mesa ${mesa.numero}: el cliente ya dejó listo su pedido para cuando llegues.`;
        const enlace = enlaces.grillaMesas(mesa.id);
        if (mesa.meseroAsignadoId) {
          await notificarUsuarios({ userIds: [mesa.meseroAsignadoId], tipo, mensaje, enlace });
        } else {
          await notificarPorRol({ rol: "MESERO", tipo, mensaje, enlace });
        }
      }
    } else {
      // Pedido de mostrador: lo atiende el admin en caja.
      await notificarPorRol({
        rol: "ADMIN",
        tipo: "SOLICITUD_PEDIDO_CLIENTE",
        mensaje: `Pedido de mostrador de ${nombreCliente} esperando en caja.`,
        enlace: enlaces.mostrador(solicitud.id),
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

// Marca la solicitud como resuelta SOLO si sigue pendiente, en la misma
// operación que la lee: si dos personas confirman (o una confirma y otra
// descarta) al mismo tiempo, la base de datos deja pasar solo a la primera y
// la segunda recibe un 409 — antes ambas pasaban y quedaban pedidos duplicados.
async function tomarSolicitudPendiente(
  tx: Prisma.TransactionClient,
  solicitudId: string,
  estado: "CONFIRMADA" | "DESCARTADA",
  resueltaPorId: string
) {
  const tomada = await tx.solicitudPedido.updateMany({
    where: { id: solicitudId, estado: "PENDIENTE" },
    data: { estado, resueltaEn: new Date(), resueltaPorId },
  });
  if (tomada.count === 0) throw new ErrorDeNegocio("Esta solicitud ya fue resuelta", 409);
}

solicitudesRouter.put(
  "/:id/confirmar",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const pedidoId = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPedido.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!solicitud) throw new ErrorDeNegocio("Solicitud no encontrada", 404);
      if (!solicitud.mesaId) {
        throw new ErrorDeNegocio("Esta es una solicitud de mostrador — usa PUT /:id/confirmar-recogida", 400);
      }

      const sesion = await tx.mesaSesion.findFirst({ where: { mesaId: solicitud.mesaId, estado: "ABIERTA" } });
      if (!sesion) throw new ErrorDeNegocio("Primero debes abrir la mesa antes de confirmar el pedido del cliente", 409);
      if (sesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
        throw new ErrorDeNegocio("Esta mesa la está atendiendo otro mesero", 403);
      }

      await tomarSolicitudPendiente(tx, solicitud.id, "CONFIRMADA", req.user!.userId);
      const nuevoPedidoId = await crearPedidoEnTx(tx, {
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
      await tx.solicitudPedido.update({ where: { id: solicitud.id }, data: { pedidoId: nuevoPedidoId } });
      return nuevoPedidoId;
    });

    const pedidoCompleto = await anunciarPedidoNuevo(pedidoId);
    const solicitudActualizada = await prisma.solicitudPedido.findUnique({ where: { id: req.params.id }, include: solicitudInclude });
    emitSolicitudActualizada(solicitudActualizada);
    res.json({ solicitud: solicitudActualizada, pedido: pedidoCompleto });
  })
);

const confirmarRecogidaSchema = z.object({ metodoPago: z.enum(["EFECTIVO", "TARJETA", "OTRO"]) });

// Pedido de mostrador (sin mesa): lo confirma el admin en caja, y como está
// físicamente con el cliente en ese momento, cobra ahí mismo en el mismo
// paso — así el cliente solo tiene que volver una vez, a recoger. Pedido,
// factura y solicitud se guardan juntos o no se guarda nada: nunca queda un
// pedido en cocina sin su pago registrado.
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

    const { pedidoId, facturaId } = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPedido.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!solicitud) throw new ErrorDeNegocio("Solicitud no encontrada", 404);
      if (solicitud.mesaId) throw new ErrorDeNegocio("Esta solicitud es de una mesa — usa PUT /:id/confirmar", 400);

      await tomarSolicitudPendiente(tx, solicitud.id, "CONFIRMADA", req.user!.userId);
      const nuevoPedidoId = await crearPedidoEnTx(tx, {
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

      const items = await tx.pedidoItem.findMany({ where: { pedidoId: nuevoPedidoId } });
      const subtotal = items.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0);
      const factura = await tx.factura.create({
        data: {
          pedidoId: nuevoPedidoId,
          subtotal,
          total: subtotal,
          estado: "PAGADA",
          metodoPago: parsed.data.metodoPago,
          pagadaEn: new Date(),
          cerradaPorId: req.user!.userId,
        },
      });
      await tx.solicitudPedido.update({ where: { id: solicitud.id }, data: { pedidoId: nuevoPedidoId } });
      return { pedidoId: nuevoPedidoId, facturaId: factura.id };
    });

    const pedidoCompleto = await anunciarPedidoNuevo(pedidoId);
    const factura = await prisma.factura.findUnique({ where: { id: facturaId } });
    const solicitudActualizada = await prisma.solicitudPedido.findUnique({ where: { id: req.params.id }, include: solicitudInclude });
    emitSolicitudActualizada(solicitudActualizada);
    res.json({ solicitud: solicitudActualizada, pedido: pedidoCompleto, factura });
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
    await prisma.$transaction((tx) => tomarSolicitudPendiente(tx, solicitud.id, "DESCARTADA", req.user!.userId));
    const actualizada = await prisma.solicitudPedido.findUnique({ where: { id: solicitud.id }, include: solicitudInclude });
    emitSolicitudActualizada(actualizada);
    res.json(actualizada);
  })
);
