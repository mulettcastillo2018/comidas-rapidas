import type { MetodoPago, TotalesCaja } from "./types";

// Lo que debe haber en efectivo en la caja: base + lo cobrado en efectivo +
// entradas − salidas (igual que calcula el backend al cerrar).
export function efectivoEsperado(base: number, t: Pick<TotalesCaja, "totalEfectivo" | "totalEntradas" | "totalSalidas">) {
  return base + t.totalEfectivo + t.totalEntradas - t.totalSalidas;
}

export function totalesPorMetodo(t: TotalesCaja): [MetodoPago, number][] {
  return [
    ["EFECTIVO", t.totalEfectivo],
    ["TARJETA", t.totalTarjeta],
    ["NEQUI", t.totalNequi],
    ["DAVIPLATA", t.totalDaviplata],
    ["TRANSFERENCIA", t.totalTransferencia],
    ["OTRO", t.totalOtro],
    ["PLATAFORMA", t.totalPlataforma ?? 0],
  ];
}

export function totalCobrado(t: TotalesCaja) {
  return totalesPorMetodo(t).reduce((s, [, v]) => s + v, 0);
}
