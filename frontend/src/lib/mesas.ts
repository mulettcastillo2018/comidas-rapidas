import type { Mesa } from "./types";

// Orden natural: "Mesa 2" antes que "Mesa 10" (el backend las ordena como texto).
export function ordenarMesas(mesas: Mesa[]): Mesa[] {
  return [...mesas].sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
}

// Aplica un evento "mesa:actualizada" a la lista local: agrega mesas nuevas,
// reemplaza las existentes y quita las borradas. Con incluirInactivas=false
// (grilla del mesero) una mesa desactivada también desaparece, y reaparece
// si el admin la reactiva.
export function aplicarCambioDeMesa(prev: Mesa[], mesa: Mesa, incluirInactivas: boolean): Mesa[] {
  const sinElla = prev.filter((m) => m.id !== mesa.id);
  if (mesa.eliminada || (!mesa.activa && !incluirInactivas)) return sinElla;
  return ordenarMesas([...sinElla, mesa]);
}
