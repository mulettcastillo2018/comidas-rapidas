import type { TonoInsignia } from "@/components/ui";
import type { MetodoPago, PedidoEstado } from "./types";

// Color de cada estado en todo el sistema (mesero, cocina, pantalla, admin).
export const ESTADO_TONO: Record<PedidoEstado, TonoInsignia> = {
  RECIBIDO: "info",
  EN_PREPARACION: "aviso",
  LISTO: "exito",
  ENTREGADO: "neutro",
  CANCELADO: "peligro",
};

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
  PLATAFORMA: "App de domicilios",
};

// Los que se pueden elegir al cobrar (lo de las apps se registra solo).
export const METODOS_PAGO = (Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).filter((m) => m !== "PLATAFORMA");
