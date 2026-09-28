import type { Promocion } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { diaSemanaLocal, minutoDelDiaLocal } from "../lib/fechas";

function aMinutos(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Horario en hora de Colombia. Si termina "antes" de empezar (22:00 a 02:00),
// cruza la medianoche.
function enHorario(p: Pick<Promocion, "horaInicio" | "horaFin">, minuto: number) {
  if (!p.horaInicio && !p.horaFin) return true;
  const inicio = p.horaInicio ? aMinutos(p.horaInicio) : 0;
  const fin = p.horaFin ? aMinutos(p.horaFin) : 24 * 60;
  return inicio <= fin ? minuto >= inicio && minuto < fin : minuto >= inicio || minuto < fin;
}

export function estaVigente(p: Promocion, ahora = new Date()) {
  return (
    p.activa &&
    (!p.desde || p.desde <= ahora) &&
    (!p.hasta || p.hasta > ahora) &&
    (p.diasSemana.length === 0 || p.diasSemana.includes(diaSemanaLocal(ahora))) &&
    enHorario(p, minutoDelDiaLocal(ahora))
  );
}

export async function promocionesVigentes(ahora = new Date()) {
  const activas = await prisma.promocion.findMany({ where: { activa: true } });
  return activas.filter((p) => estaVigente(p, ahora));
}

// Si varias aplican al mismo producto, gana la de mayor descuento.
export function mejorPromocion(producto: { id: string; categoriaId: string }, vigentes: Promocion[]) {
  return vigentes
    .filter((p) => p.productoIds.includes(producto.id) || p.categoriaIds.includes(producto.categoriaId))
    .sort((a, b) => b.descuentoPct - a.descuentoPct)[0];
}

// Redondeado a la centena, como se maneja el efectivo.
export function precioConDescuento(precio: number, descuentoPct: number) {
  return Math.max(0, Math.round((precio * (100 - descuentoPct)) / 100 / 100) * 100);
}
