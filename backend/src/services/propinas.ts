import { prisma } from "../lib/prisma";
import { rangoDeDias } from "../lib/fechas";
import { nombreCompleto } from "../lib/nombre";
import { repartirProporcional } from "./lineasPedido";
import { sedes } from "./sedes";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

// Horas de un turno que caen dentro del rango [inicio, fin).
export function horasEnRango(entrada: Date, salida: Date, inicio: Date, fin: Date): number {
  const desde = Math.max(entrada.getTime(), inicio.getTime());
  const hasta = Math.min(salida.getTime(), fin.getTime());
  return hasta > desde ? redondear2((hasta - desde) / 3_600_000) : 0;
}

export async function obtenerConfiguracion() {
  return prisma.configuracion.upsert({ where: { id: "unica" }, create: {}, update: {} });
}

interface Persona {
  userId: string;
  nombre: string;
  role: string;
  horas: number;
  propiasGeneradas: number;
  monto: number;
}

// Reparto sugerido de las propinas cobradas en el rango, sede por sede (las
// propinas de una sede son de la gente que trabajó en ella):
// - Cocina se lleva el porcentaje configurado, repartido por horas trabajadas.
// - El resto (salón): cada mesero lo de sus mesas (PROPIAS), o todo junto
//   repartido por horas entre los meseros (POZO).
// Siempre reparte exactamente el total, sin perder ni inventar pesos.
export async function repartoDePropinas(desde: string, hasta: string, sedesIds: string[] | null = null) {
  const config = await obtenerConfiguracion();
  const lista = await sedes();
  const ids = sedesIds ?? lista.map((s) => s.id);
  const partes = await Promise.all(ids.map((id) => repartoDeSede(desde, hasta, id, config)));
  // Juntar las sedes (alguien que cambió de sede en el rango suma en ambas).
  const reparto = new Map<string, Persona>();
  for (const p of partes.flatMap((r) => r.reparto)) {
    const antes = reparto.get(p.userId);
    reparto.set(
      p.userId,
      antes
        ? { ...antes, horas: redondear2(antes.horas + p.horas), propiasGeneradas: antes.propiasGeneradas + p.propiasGeneradas, monto: antes.monto + p.monto }
        : p
    );
  }
  const varias = ids.length > 1;
  const nombre = (id: string) => lista.find((s) => s.id === id)?.nombre ?? "";
  return {
    desde,
    hasta,
    total: partes.reduce((s, r) => s + r.total, 0),
    modo: config.propinaModo,
    pctCocina: config.propinaPctCocina,
    paraCocina: partes.reduce((s, r) => s + r.paraCocina, 0),
    paraSalon: partes.reduce((s, r) => s + r.paraSalon, 0),
    reparto: [...reparto.values()].sort((a, b) => b.monto - a.monto),
    avisos: partes.flatMap((r, i) => r.avisos.map((a) => (varias ? `${nombre(ids[i])}: ${a}` : a))),
  };
}

async function repartoDeSede(desde: string, hasta: string, sedeId: string, config: Awaited<ReturnType<typeof obtenerConfiguracion>>) {
  const { inicio, fin } = rangoDeDias(desde, hasta);
  const [facturas, turnos, cocinaActiva] = await Promise.all([
    prisma.factura.findMany({
      where: { estado: "PAGADA", pagadaEn: { gte: inicio, lt: fin }, propinaMonto: { gt: 0 }, sedeId },
      select: { propinaMonto: true, mesaSesion: { select: { meseroId: true } }, pedido: { select: { meseroId: true } } },
    }),
    prisma.turno.findMany({
      where: { entrada: { lt: fin }, OR: [{ salida: null }, { salida: { gt: inicio } }], sedeId },
      select: { userId: true, entrada: true, salida: true },
    }),
    prisma.user.findMany({ where: { role: "COCINA", isActive: true, sedeId }, select: { id: true } }),
  ]);

  const total = facturas.reduce((s, f) => s + f.propinaMonto, 0);
  const propias = new Map<string, number>();
  for (const f of facturas) {
    const quien = f.mesaSesion?.meseroId ?? f.pedido?.meseroId;
    if (quien) propias.set(quien, (propias.get(quien) ?? 0) + f.propinaMonto);
  }
  const ahora = new Date();
  const horas = new Map<string, number>();
  for (const t of turnos) horas.set(t.userId, redondear2((horas.get(t.userId) ?? 0) + horasEnRango(t.entrada, t.salida ?? ahora, inicio, fin)));

  const ids = new Set([...propias.keys(), ...horas.keys()]);
  const usuarios = await prisma.user.findMany({
    where: { id: { in: [...ids, ...cocinaActiva.map((u) => u.id)] } },
    select: { id: true, nombre: true, apellido: true, role: true },
  });
  const personas = new Map<string, Persona>(
    usuarios.map((u) => [u.id, { userId: u.id, nombre: nombreCompleto(u), role: u.role, horas: horas.get(u.id) ?? 0, propiasGeneradas: propias.get(u.id) ?? 0, monto: 0 }])
  );
  const avisos: string[] = [];
  const repartir = (monto: number, grupo: Persona[], peso: (p: Persona) => number) => {
    const partes = repartirProporcional(monto, grupo.map(peso));
    grupo.forEach((p, i) => (p.monto += partes[i]));
  };

  // Cocina.
  let paraCocina = Math.round((total * config.propinaPctCocina) / 100);
  const cocina = [...personas.values()].filter((p) => p.role === "COCINA");
  const cocinaConHoras = cocina.filter((p) => p.horas > 0);
  if (paraCocina > 0) {
    if (cocinaConHoras.length > 0) {
      repartir(paraCocina, cocinaConHoras, (p) => p.horas);
    } else if (cocina.length > 0) {
      avisos.push(`Nadie de cocina marcó turno en estas fechas: su parte se repartió por partes iguales entre las ${cocina.length} persona(s) de cocina.`);
      repartir(paraCocina, cocina, () => 1);
    } else {
      avisos.push("No hay personal de cocina activo: todas las propinas quedan para el salón.");
      paraCocina = 0;
    }
  }

  // Salón.
  const paraSalon = total - paraCocina;
  const generadores = [...personas.values()].filter((p) => p.role !== "COCINA" && p.propiasGeneradas > 0);
  const meserosConHoras = [...personas.values()].filter((p) => p.role === "MESERO" && p.horas > 0);
  if (paraSalon > 0) {
    if (config.propinaModo === "POZO" && meserosConHoras.length > 0) {
      repartir(paraSalon, meserosConHoras, (p) => p.horas);
    } else {
      if (config.propinaModo === "POZO") avisos.push("Ningún mesero marcó turno en estas fechas: el salón se repartió según las propinas de las mesas de cada uno.");
      if (generadores.length > 0) repartir(paraSalon, generadores, (p) => p.propiasGeneradas);
    }
  }

  return {
    total,
    paraCocina,
    paraSalon,
    reparto: [...personas.values()].filter((p) => p.monto > 0 || p.horas > 0 || p.propiasGeneradas > 0),
    avisos,
  };
}
