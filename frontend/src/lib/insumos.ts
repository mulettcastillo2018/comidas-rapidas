// Insumos (ingredientes) y recetas.

export type UnidadInsumo = "GRAMO" | "MILILITRO" | "UNIDAD";

export interface Insumo {
  id: string;
  nombre: string;
  unidad: UnidadInsumo;
  stock: number;
  stockMinimo: number;
  // Pesos por unidad base (g, ml o unidad).
  costoUnitario: number;
  alertaStockBajo: boolean;
  activo: boolean;
  valorEnInventario: number;
  usadoEn: string[];
  enAdiciones: number;
}

export interface MovimientoInsumo {
  id: string;
  tipo: "COMPRA" | "CONSUMO" | "DEVOLUCION" | "AJUSTE";
  cantidad: number;
  stockResultante: number;
  costoTotal: number | null;
  nota: string | null;
  creadoEn: string;
  usuario: string | null;
}

export interface Receta {
  id: string;
  nombre: string;
  costo: number | null;
  costoDesdeReceta: boolean;
  esCombo: boolean;
  costoReceta: number;
  receta: { insumoId: string; cantidad: number; insumo: { id: string; nombre: string; unidad: UnidadInsumo; costoUnitario: number } }[];
}

export interface ConsumoInsumos {
  filas: {
    insumoId: string;
    nombre: string;
    unidad: UnidadInsumo;
    consumo: number;
    valorConsumo: number;
    compras: number;
    valorCompras: number;
    diferenciaConteo: number;
    valorDiferencia: number;
  }[];
  totales: { valorConsumo: number; valorCompras: number; merma: number };
}

export const UNIDAD_LABEL: Record<UnidadInsumo, string> = { GRAMO: "gramos", MILILITRO: "mililitros", UNIDAD: "unidades" };
export const UNIDAD_CORTA: Record<UnidadInsumo, string> = { GRAMO: "g", MILILITRO: "ml", UNIDAD: "und" };

// Presentaciones para digitar compras y conteos: kg y L se guardan en g y ml.
export const PRESENTACIONES: Record<UnidadInsumo, { etiqueta: string; factor: number }[]> = {
  GRAMO: [
    { etiqueta: "kg", factor: 1000 },
    { etiqueta: "g", factor: 1 },
    { etiqueta: "lb (500 g)", factor: 500 },
  ],
  MILILITRO: [
    { etiqueta: "L", factor: 1000 },
    { etiqueta: "ml", factor: 1 },
  ],
  UNIDAD: [{ etiqueta: "und", factor: 1 }],
};

export function formatoCantidad(cantidad: number, unidad: UnidadInsumo): string {
  const n = Math.round(cantidad * 100) / 100;
  const fmt = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  if (unidad === "GRAMO") return Math.abs(n) >= 1000 ? `${fmt(n / 1000)} kg` : `${fmt(n)} g`;
  if (unidad === "MILILITRO") return Math.abs(n) >= 1000 ? `${fmt(n / 1000)} L` : `${fmt(n)} ml`;
  return `${fmt(n)} und`;
}

// Costo por kg / L / unidad, que es como se piensa al comprar.
export function formatoCostoUnitario(costo: number, unidad: UnidadInsumo): string {
  const pesos = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  if (unidad === "GRAMO") return `${pesos(costo * 1000)} / kg`;
  if (unidad === "MILILITRO") return `${pesos(costo * 1000)} / L`;
  return `${pesos(costo)} / und`;
}
