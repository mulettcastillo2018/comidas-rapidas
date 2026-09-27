const RANGO: Record<string, number> = { RECIBIDO: 0, EN_PREPARACION: 1, LISTO: 2, ENTREGADO: 3 };

interface ItemConEstado {
  estado: string;
}

// El estado del pedido es el del ítem menos avanzado entre los que siguen
// activos (no cancelados) — "el pedido está listo" solo cuando TODOS sus
// productos están listos, "en preparación" apenas empieza el primero, etc.
// Si todos los ítems se cancelaron, el pedido completo queda CANCELADO.
export function calcularEstadoPedido(items: ItemConEstado[]): "RECIBIDO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO" {
  const activos = items.filter((i) => i.estado !== "CANCELADO");
  if (activos.length === 0) return "CANCELADO";
  const minRango = Math.min(...activos.map((i) => RANGO[i.estado] ?? 0));
  return (Object.keys(RANGO).find((k) => RANGO[k] === minRango) as "RECIBIDO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO") ?? "RECIBIDO";
}
