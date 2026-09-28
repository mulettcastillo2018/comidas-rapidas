import { prisma } from "../lib/prisma";
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

export class CrearPedidoError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

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

// Centraliza la creación de un Pedido real (validación de productos, snapshot
// de precio/tiempo, notificación a cocina y push por socket) para que tanto
// el flujo normal del mesero (POST /pedidos) como la confirmación de una
// SolicitudPedido del cliente usen exactamente la misma lógica.
export async function crearPedido(params: CrearPedidoParams) {
  const { mesaSesionId = null, nombreCliente = null, telefonoCliente = null, meseroId, notasGenerales, items, origenCliente = false } = params;

  const productos = await prisma.producto.findMany({ where: { id: { in: items.map((i) => i.productoId) } } });
  const productosPorId = new Map(productos.map((p) => [p.id, p]));
  for (const item of items) {
    const producto = productosPorId.get(item.productoId);
    if (!producto || !producto.isActive) {
      throw new CrearPedidoError("Uno de los productos seleccionados ya no está disponible", 400);
    }
  }

  const pedido = await prisma.$transaction(async (tx) => {
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
    return created;
  });

  const pedidoCompleto = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: pedidoInclude });
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
