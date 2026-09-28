import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";
import { emitPedidoNuevo } from "../realtime/socket";
import { notificarPorRol } from "./notificaciones";

export const pedidoInclude = {
  items: { include: { producto: true, comensal: true } },
  mesaSesion: { include: { mesa: true, mesero: { select: { id: true, nombre: true, apellido: true } } } },
  statusLogs: {
    include: { cambiadoPor: { select: { id: true, nombre: true, apellido: true, role: true } } },
    orderBy: { cambiadoEn: "asc" as const },
  },
};

interface CrearPedidoItem {
  comensalId?: string | null;
  productoId: string;
  cantidad: number;
  notas?: string | null;
  paraLlevar?: boolean;
}

interface CrearPedidoParams {
  // Un pedido normal va atado a una mesa abierta. Un pedido de mostrador (sin
  // mesa, alguien que pide para recoger) deja esto en null y en cambio manda
  // nombreCliente/telefonoCliente para poder identificarlo.
  mesaSesionId?: string | null;
  nombreCliente?: string | null;
  telefonoCliente?: string | null;
  meseroId: string;
  notasGenerales?: string | null;
  items: CrearPedidoItem[];
  // true cuando el pedido nace de una SolicitudPedido armada por el cliente
  // desde el QR — el mesero/admin solo la validó, no la escribió él mismo.
  origenCliente?: boolean;
}

// Crea el Pedido (validación de productos + snapshot de precio/tiempo) dentro
// de una transacción que maneja quien llama, para que pueda combinarse
// atómicamente con otros pasos (confirmar la solicitud, crear la factura...).
// No avisa a nadie: eso lo hace anunciarPedidoNuevo() una vez confirmada la
// transacción, para no anunciar un pedido que al final se revirtió.
export async function crearPedidoEnTx(tx: Prisma.TransactionClient, params: CrearPedidoParams): Promise<string> {
  const { mesaSesionId = null, nombreCliente = null, telefonoCliente = null, meseroId, notasGenerales, items, origenCliente = false } = params;

  const productos = await tx.producto.findMany({ where: { id: { in: items.map((i) => i.productoId) } } });
  const productosPorId = new Map(productos.map((p) => [p.id, p]));
  for (const item of items) {
    const producto = productosPorId.get(item.productoId);
    if (!producto || !producto.isActive) {
      throw new ErrorDeNegocio("Uno de los productos seleccionados ya no está disponible", 400);
    }
  }

  const created = await tx.pedido.create({
    data: {
      mesaSesionId,
      nombreCliente,
      telefonoCliente,
      meseroId,
      notasGenerales: notasGenerales ?? null,
      origenCliente,
      items: {
        create: items.map((item) => {
          const producto = productosPorId.get(item.productoId)!;
          return {
            comensalId: item.comensalId ?? null,
            paraLlevar: item.paraLlevar ?? false,
            productoId: item.productoId,
            cantidad: item.cantidad,
            notas: item.notas ?? null,
            precioUnitario: producto.precio,
            tiempoPreparacionMinutos: producto.tiempoPreparacionMinutos,
          };
        }),
      },
      statusLogs: { create: { aEstado: "RECIBIDO", cambiadoPorId: meseroId } },
    },
  });
  return created.id;
}

export async function anunciarPedidoNuevo(pedidoId: string) {
  const pedidoCompleto = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: pedidoInclude });
  if (pedidoCompleto) {
    emitPedidoNuevo(pedidoCompleto);
    const ubicacion = pedidoCompleto.mesaSesion
      ? `Mesa ${pedidoCompleto.mesaSesion.mesa.numero}`
      : `Mostrador — ${pedidoCompleto.nombreCliente ?? "cliente"}`;
    await notificarPorRol({
      rol: "COCINA",
      tipo: "PEDIDO_NUEVO",
      mensaje: `Nuevo pedido en ${ubicacion} — ${pedidoCompleto.items.length} producto(s)`,
      pedidoId: pedidoCompleto.id,
    });
  }
  return pedidoCompleto;
}

export async function crearPedido(params: CrearPedidoParams) {
  const pedidoId = await prisma.$transaction((tx) => crearPedidoEnTx(tx, params));
  return anunciarPedidoNuevo(pedidoId);
}
