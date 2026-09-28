import type { Comensal, MesaSesion, PedidoItem } from "./types";

export const PORCENTAJE_PROPINA_SUGERIDA = 10;

export interface PartePersona {
  comensal: Comensal;
  items: PedidoItem[];
  propios: number;
  compartido: number;
  propina: number;
  total: number;
}

export interface Precuenta {
  items: PedidoItem[];
  subtotal: number;
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

// Sugerencia para dividir la cuenta: cada quien paga lo suyo, y lo
// compartido y la propina se reparten por partes iguales. Es solo una guía
// para el mesero; la cuenta sigue siendo una sola.
export function calcularPrecuenta(sesion: MesaSesion, propina: number): Precuenta {
  const items = (sesion.pedidos ?? []).flatMap((p) => p.items).filter((i) => i.estado !== "CANCELADO");
  const comensales = sesion.comensales ?? [];
  const compartidos = items.filter((i) => !i.comensalId || !comensales.some((c) => c.id === i.comensalId));
  const totalCompartido = valor(compartidos);
  const partesCompartido = repartir(totalCompartido, comensales.length);
  const partesPropina = repartir(propina, comensales.length);

  const porPersona = comensales.map((comensal, i) => {
    const suyos = items.filter((item) => item.comensalId === comensal.id);
    const propios = valor(suyos);
    return {
      comensal,
      items: suyos,
      propios,
      compartido: partesCompartido[i],
      propina: partesPropina[i],
      total: propios + partesCompartido[i] + partesPropina[i],
    };
  });

  const subtotal = valor(items);
  return { items, subtotal, propina, total: subtotal + propina, compartidos, totalCompartido, porPersona };
}

export function propinaSugerida(subtotal: number): number {
  // Redondeada a la centena, como se maneja el efectivo.
  return Math.round((subtotal * PORCENTAJE_PROPINA_SUGERIDA) / 100 / 100) * 100;
}
