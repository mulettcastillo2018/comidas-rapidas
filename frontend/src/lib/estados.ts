import type { PedidoEstado } from "./types";

// Estado del pedido completo (visto por el mesero).
export const PEDIDO_ESTADO_LABEL: Record<PedidoEstado, string> = {
  RECIBIDO: "Recibido en cocina",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// Estado de cada producto dentro del pedido.
export const ITEM_ESTADO_LABEL: Record<PedidoEstado, string> = {
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

export const METODO_PAGO_LABEL = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", OTRO: "Otro" } as const;
