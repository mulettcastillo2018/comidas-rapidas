import type { CanalPedido, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ubicacionDe } from "../lib/ubicacion";
import { calcularEstadoPedido } from "../lib/pedidoAggregate";
import { construirLineas, type ItemPedido } from "./lineasPedido";
import { OMITIR_ITEM, productoPublico } from "../lib/datosInternos";
import { descontarStock, revisarStock } from "./inventario";
import { emitPedidoNuevo } from "../realtime/socket";
import { enlaces, notificarPorRol } from "./notificaciones";

export const pedidoInclude = {
  // Viaja a meseros, cocina y pantalla: sin costos.
  items: {
    omit: OMITIR_ITEM,
    include: { producto: productoPublico, comensal: true, adiciones: { select: { nombre: true, precio: true } } },
  },
  mesaSesion: { include: { mesa: true, mesero: { select: { id: true, nombre: true, apellido: true } } } },
  plataforma: { select: { nombre: true } },
  statusLogs: {
    include: { cambiadoPor: { select: { id: true, nombre: true, apellido: true, role: true } } },
    orderBy: { cambiadoEn: "asc" as const },
  },
};

interface CrearPedidoParams {
  // Por defecto: MESA si trae mesa, MOSTRADOR si no.
  canal?: CanalPedido;
  plataformaId?: string | null;
  codigoPlataforma?: string | null;
  // Un pedido normal va atado a una mesa abierta. Un pedido de mostrador (sin
  // mesa, alguien que pide para recoger) deja esto en null y en cambio manda
  // nombreCliente/telefonoCliente para poder identificarlo.
  mesaSesionId?: string | null;
  nombreCliente?: string | null;
  telefonoCliente?: string | null;
  meseroId: string;
  notasGenerales?: string | null;
  items: ItemPedido[];
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
  const canal = params.canal ?? (mesaSesionId ? "MESA" : "MOSTRADOR");

  // Precios (adiciones, promociones, combos), disponibilidad y costos. Lo que
  // no requiere cocina (bebidas, empacados) nace listo para llevar a la mesa;
  // el pedido toma el estado de su producto menos avanzado.
  const itemsData = await construirLineas(tx, items);
  const ahora = new Date();
  const estadoInicial = calcularEstadoPedido(itemsData.map((i) => ({ estado: i.estado ?? "RECIBIDO" })));

  const created = await tx.pedido.create({
    data: {
      canal,
      mesaSesionId,
      nombreCliente,
      telefonoCliente,
      plataformaId: params.plataformaId ?? null,
      codigoPlataforma: params.codigoPlataforma ?? null,
      meseroId,
      notasGenerales: notasGenerales ?? null,
      origenCliente,
      estado: estadoInicial,
      ...(estadoInicial === "LISTO" ? { listoEn: ahora } : {}),
      items: { create: itemsData },
      statusLogs: { create: { aEstado: estadoInicial, cambiadoPorId: meseroId } },
    },
    include: { items: { select: { id: true, productoId: true, cantidad: true } } },
  });
  await descontarStock(
    tx,
    created.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad, pedidoItemId: i.id })),
    meseroId
  );
  return created.id;
}

export async function anunciarPedidoNuevo(pedidoId: string) {
  const pedidoCompleto = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: pedidoInclude });
  if (pedidoCompleto) {
    emitPedidoNuevo(pedidoCompleto);
    await revisarStock(pedidoCompleto.items.map((i) => i.productoId));
    const ubicacion = ubicacionDe(pedidoCompleto);
    // Si todo es de los que no pasan por cocina (p. ej. solo gaseosas), no
    // hay nada que avisarle a cocina.
    const paraCocina = pedidoCompleto.items.filter((i) => i.estado === "RECIBIDO").length;
    if (paraCocina > 0) {
      await notificarPorRol({
        rol: "COCINA",
        tipo: "PEDIDO_NUEVO",
        mensaje: `Nuevo pedido en ${ubicacion} — ${paraCocina} producto(s)`,
        pedidoId: pedidoCompleto.id,
        enlace: enlaces.cocina(pedidoCompleto.id),
      });
    }
  }
  return pedidoCompleto;
}

export async function crearPedido(params: CrearPedidoParams) {
  const pedidoId = await prisma.$transaction((tx) => crearPedidoEnTx(tx, params));
  return anunciarPedidoNuevo(pedidoId);
}
