import type { Request } from "express";
import type { Sede } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";

// Las sedes cambian muy poco y se consultan en cada petición: se guardan unos
// segundos en memoria (y se olvidan al crear o editar una).
const TTL_MS = 30_000;
let cache: { sedes: Sede[]; expira: number } | null = null;

export async function sedes(): Promise<Sede[]> {
  if (cache && cache.expira > Date.now()) return cache.sedes;
  const lista = await prisma.sede.findMany({ orderBy: [{ esPrincipal: "desc" }, { nombre: "asc" }] });
  cache = { sedes: lista, expira: Date.now() + TTL_MS };
  return lista;
}

export function olvidarSedes() {
  cache = null;
}

export async function sedePrincipal(): Promise<Sede> {
  const lista = await sedes();
  const principal = lista.find((s) => s.esPrincipal) ?? lista[0];
  if (!principal) throw new ErrorDeNegocio("No hay ninguna sede configurada", 500);
  return principal;
}

export async function sedeActivaPorId(id: string | null | undefined): Promise<Sede | null> {
  if (!id) return null;
  return (await sedes()).find((s) => s.id === id && s.activa) ?? null;
}

export async function nombreSede(id: string): Promise<string> {
  return (await sedes()).find((s) => s.id === id)?.nombre ?? "";
}

// Sede de trabajo de un usuario: la suya; si es administrador general, la que
// eligió (si existe y está activa) o la principal.
export async function sedeDeTrabajo(sedeDelUsuario: string | null, pedida: unknown): Promise<string> {
  if (sedeDelUsuario) return sedeDelUsuario;
  const elegida = typeof pedida === "string" ? await sedeActivaPorId(pedida) : null;
  return (elegida ?? (await sedePrincipal())).id;
}

// Sede de lo que pide un cliente desde el QR (sin sesión): la de la mesa si
// viene de una mesa; si no, la del QR de mostrador; si no, la principal.
export async function sedeDeLaCarta(mesaId: unknown, sedeId: unknown): Promise<string> {
  if (typeof mesaId === "string" && mesaId) {
    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { sedeId: true } });
    if (mesa) return mesa.sedeId;
  }
  return (typeof sedeId === "string" ? await sedeActivaPorId(sedeId) : null)?.id ?? (await sedePrincipal()).id;
}

// Sedes que abarca un reporte: la del usuario si tiene sede fija; para el
// administrador general, la que tiene elegida, o todas con ?sede=todas.
// null = todas.
export function sedesDelReporte(req: Request): string[] | null {
  if (req.sedeFija) return [req.sedeId];
  return req.query.sede === "todas" ? null : [req.sedeId];
}

// Para filtros de Prisma: { sedeId: {in: [...]}} o nada.
export function filtroSedes(sedesIds: string[] | null): { sedeId?: { in: string[] } } {
  return sedesIds ? { sedeId: { in: sedesIds } } : {};
}

// Quien tiene sede fija solo toca lo de su sede; el administrador general,
// cualquier sede.
export function exigirMismaSede(req: Request, sedeId: string, que = "Eso") {
  if (req.sedeFija && req.sedeId !== sedeId) throw new ErrorDeNegocio(`${que} es de otra sede`, 403);
}
