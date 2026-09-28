import type { PedidoItem } from "./types";

// "Hamburguesa + Extra queso, Sin cebolla": lo que cocina tiene que ver.
export function conAdiciones(item: Pick<PedidoItem, "adiciones">, nombre: string | undefined) {
  const extras = item.adiciones?.map((a) => a.nombre) ?? [];
  return extras.length > 0 ? `${nombre ?? "Producto"} + ${extras.join(", ")}` : (nombre ?? "Producto");
}

// Si es parte de un combo, el nombre del combo para mostrarlo al lado.
export function etiquetaCombo(item: Pick<PedidoItem, "comboNombre">) {
  return item.comboNombre ? `🍱 ${item.comboNombre}` : null;
}
