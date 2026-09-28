import type { Pedido, PedidoItem } from "./types";

// Aplica un "pedido:actualizado" a una lista de pedidos activos: los que ya
// se entregaron o cancelaron salen de la lista.
export function reemplazarPedidoActivo(prev: Pedido[], pedido: Pedido): Pedido[] {
  if (pedido.estado === "ENTREGADO" || pedido.estado === "CANCELADO") return prev.filter((p) => p.id !== pedido.id);
  if (!prev.some((p) => p.id === pedido.id)) return [...prev, pedido];
  return prev.map((p) => (p.id === pedido.id ? pedido : p));
}

export function ubicacionPedido(pedido: Pedido): string {
  return pedido.mesaSesion ? `Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}` : `Mostrador (${pedido.nombreCliente ?? "cliente"})`;
}

// El "reloj" de un producto arranca cuando cocina lo empieza a preparar; si
// todavía no lo ha empezado, desde que llegó el pedido.
export function minutosEnCocina(item: PedidoItem, pedidoCreadoEn: string, ahora: number): number {
  return (ahora - new Date(item.iniciadoEn ?? pedidoCreadoEn).getTime()) / 60000;
}

// Pasarse del tiempo configurado es la señal de alerta: o se demoró de
// verdad, o ya salió y nadie lo marcó en el sistema.
export function estaAtrasado(item: PedidoItem, pedidoCreadoEn: string, ahora: number): boolean {
  if (item.estado !== "RECIBIDO" && item.estado !== "EN_PREPARACION") return false;
  return minutosEnCocina(item, pedidoCreadoEn, ahora) > item.tiempoPreparacionMinutos;
}
