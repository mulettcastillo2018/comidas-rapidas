import type { MetodoPago, PedidoEstado } from "./types";

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

export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia / QR bancario",
  OTRO: "Otro",
};

export const METODOS_PAGO = Object.keys(METODO_PAGO_LABEL) as MetodoPago[];
