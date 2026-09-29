// Gastos, estado de resultados, turnos y reparto de propinas.

export type CategoriaGasto = "INSUMOS" | "NOMINA" | "ARRIENDO" | "SERVICIOS" | "MANTENIMIENTO" | "PUBLICIDAD" | "IMPUESTOS" | "OTROS";

export const CATEGORIA_GASTO_LABEL: Record<CategoriaGasto, string> = {
  INSUMOS: "Insumos y mercancía",
  NOMINA: "Nómina y pagos al personal",
  ARRIENDO: "Arriendo",
  SERVICIOS: "Servicios (luz, agua, gas, internet)",
  MANTENIMIENTO: "Mantenimiento y reparaciones",
  PUBLICIDAD: "Publicidad",
  IMPUESTOS: "Impuestos y trámites",
  OTROS: "Otros",
};

export const CATEGORIAS_GASTO = Object.keys(CATEGORIA_GASTO_LABEL) as CategoriaGasto[];

// Lo que normalmente es fijo (se paga igual se venda o no), para marcarlo solo.
export const CATEGORIAS_FIJAS: CategoriaGasto[] = ["NOMINA", "ARRIENDO", "SERVICIOS"];

export interface Gasto {
  id: string;
  dia: string;
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  esFijo: boolean;
  // Se pagó con efectivo de la caja (quedó como salida del turno).
  desdeCaja: boolean;
  // Esa salida ya entró en un cierre de caja: no se puede borrar.
  enCierre: boolean;
  registradoPor: string;
  // null = gasto general del negocio (no de una sede).
  sede: string | null;
}

export interface ListaGastos {
  gastos: Gasto[];
  total: number;
  porCategoria: { categoria: CategoriaGasto; total: number }[];
}

export interface EstadoResultados {
  desde: string;
  hasta: string;
  dias: number;
  cuentas: number;
  ingresos: { ventasProductos: number; envios: number; total: number };
  // De dónde sale el costo de lo vendido: los costos configurados en cada
  // producto, o lo que se pagó en insumos si no hay costos configurados.
  fuenteCosto: "PRODUCTOS" | "COMPRAS";
  costoVentas: number;
  // Lo pagado en insumos en el rango (referencia para comparar con el costo
  // teórico: si se compra mucho más de lo que se vende, algo se pierde).
  comprasInsumos: number;
  productosSinCosto: string[];
  comisiones: number;
  utilidadBruta: number;
  gastos: {
    total: number;
    fijos: number;
    variables: number;
    porCategoria: { categoria: CategoriaGasto; total: number }[];
    // Gastos generales del negocio que no entran al ver una sede sola.
    generalesExcluidos: number;
  };
  utilidadNeta: number;
  margenNetoPct: number | null;
  puntoEquilibrio: {
    margenContribucionPct: number;
    ventasNecesarias: number;
    ventasPorDia: number;
    alcanzado: boolean;
  } | null;
  // Informativo: las propinas son del personal, no del negocio.
  propinas: number;
}

export interface Turno {
  id: string;
  userId: string;
  nombre: string;
  role: string;
  entrada: string;
  salida: string | null;
  horas: number;
  editado: boolean;
}

export interface ListaTurnos {
  turnos: Turno[];
  porPersona: { userId: string; nombre: string; role: string; horas: number; turnos: number }[];
}

export type ModoPropina = "PROPIAS" | "POZO";

export interface Configuracion {
  propinaPctCocina: number;
  propinaModo: ModoPropina;
}

export interface RepartoPropinas {
  desde: string;
  hasta: string;
  total: number;
  modo: ModoPropina;
  pctCocina: number;
  paraCocina: number;
  paraSalon: number;
  reparto: { userId: string; nombre: string; role: string; horas: number; propiasGeneradas: number; monto: number }[];
  avisos: string[];
}

// Horas con un decimal, p. ej. "7,5 h".
export function formatoHoras(horas: number): string {
  return `${horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`;
}
