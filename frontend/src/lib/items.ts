import type { PedidoItem, Producto } from "./types";

// Precio por unidad como se va a cobrar: con la promoción vigente y las
// adiciones elegidas.
export function precioConAdiciones(p: Producto | undefined, adicionIds: string[]) {
  if (!p) return 0;
  const extra = (p.adiciones ?? []).filter((a) => adicionIds.includes(a.id)).reduce((s, a) => s + a.precio, 0);
  return (p.promocion?.precio ?? p.precio) + extra;
}

// "Hamburguesa + Extra queso, Sin cebolla": lo que cocina tiene que ver.
export function conAdiciones(item: Pick<PedidoItem, "adiciones">, nombre: string | undefined) {
  const extras = item.adiciones?.map((a) => a.nombre) ?? [];
  return extras.length > 0 ? `${nombre ?? "Producto"} + ${extras.join(", ")}` : (nombre ?? "Producto");
}

// Si es parte de un combo, el nombre del combo para mostrarlo al lado.
export function etiquetaCombo(item: Pick<PedidoItem, "comboNombre">) {
  return item.comboNombre ? `🍱 ${item.comboNombre}` : null;
}
