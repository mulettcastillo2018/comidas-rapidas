import type { Comensal, MesaSesion, PedidoItem } from "./types";

export const PORCENTAJE_PROPINA_SUGERIDA = 10;

export interface PartePersona {
  comensal: Comensal;
  items: PedidoItem[];
  propios: number;
  compartido: number;
  descuento: number;
  propina: number;
  total: number;
}

export interface Precuenta {
  items: PedidoItem[];
  subtotal: number;
  descuento: number;
  propina: number;
  total: number;
  // Lo que no es de nadie en particular: "para compartir" y "para llevar".
  compartidos: PedidoItem[];
  totalCompartido: number;
  porPersona: PartePersona[];
}

const valor = (items: PedidoItem[]) => items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);

// Reparte un monto en partes enteras que suman exactamente el total (los
// pesos que sobran de la división van a los primeros).
function repartir(monto: number, partes: number): number[] {
  if (partes === 0) return [];
  const base = Math.floor(monto / partes);
  const sobrante = monto - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < sobrante ? 1 : 0));
}

// Reparte un monto en proporción a los pesos, en partes enteras que suman
// exactamente el total (los pesos que sobran van a los de mayor residuo).
function repartirProporcional(monto: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0);
  if (pesos.length === 0) return [];
  if (suma === 0) return repartir(monto, pesos.length);
  const exactas = pesos.map((p) => (monto * p) / suma);
  const partes = exactas.map(Math.floor);
  let sobrante = monto - partes.reduce((s, p) => s + p, 0);
  const porResiduo = exactas.map((e, i) => ({ i, residuo: e - Math.floor(e) })).sort((a, b) => b.residuo - a.residuo);
  for (const { i } of porResiduo) {
    if (sobrante <= 0) break;
    partes[i]++;
    sobrante--;
  }
  return partes;
}

// Sugerencia para dividir la cuenta: cada quien paga lo suyo, lo compartido
// y la propina se reparten por partes iguales, y el descuento en proporción a
// lo que consumió cada uno. Es solo una guía para el mesero; la cuenta sigue
// siendo una sola.
export function calcularPrecuenta(sesion: MesaSesion, propina: number, descuento = 0): Precuenta {
  const items = (sesion.pedidos ?? []).flatMap((p) => p.items).filter((i) => i.estado !== "CANCELADO");
  const comensales = sesion.comensales ?? [];
  const compartidos = items.filter((i) => !i.comensalId || !comensales.some((c) => c.id === i.comensalId));
  const totalCompartido = valor(compartidos);
  const partesCompartido = repartir(totalCompartido, comensales.length);
  const partesPropina = repartir(propina, comensales.length);
  const consumos = comensales.map((comensal, i) => valor(items.filter((item) => item.comensalId === comensal.id)) + partesCompartido[i]);
  const partesDescuento = repartirProporcional(descuento, consumos);

  const porPersona = comensales.map((comensal, i) => {
    const suyos = items.filter((item) => item.comensalId === comensal.id);
    const propios = valor(suyos);
    return {
      comensal,
      items: suyos,
      propios,
      compartido: partesCompartido[i],
      descuento: partesDescuento[i],
      propina: partesPropina[i],
      total: propios + partesCompartido[i] - partesDescuento[i] + partesPropina[i],
    };
  });

  const subtotal = valor(items);
  return { items, subtotal, descuento, propina, total: subtotal - descuento + propina, compartidos, totalCompartido, porPersona };
}

// Mismo cálculo que hace el servidor al generar la cuenta.
export function montoDescuento(subtotal: number, tipo: "PORCENTAJE" | "VALOR", valorDescuento: number): number {
  if (valorDescuento <= 0) return 0;
  return tipo === "PORCENTAJE" ? Math.round((subtotal * Math.min(valorDescuento, 100)) / 100) : Math.min(valorDescuento, subtotal);
}

export function propinaSugerida(subtotal: number): number {
  // Redondeada a la centena, como se maneja el efectivo.
  return Math.round((subtotal * PORCENTAJE_PROPINA_SUGERIDA) / 100 / 100) * 100;
}
