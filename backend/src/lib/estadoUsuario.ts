import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

interface EstadoUsuario {
  isActive: boolean;
  role: Role;
  // null = administrador general (todas las sedes).
  sedeId: string | null;
  expira: number;
}

// La base de datos está en otra región, así que consultarla en CADA petición
// agrega latencia visible. Se cachea unos segundos, y al desactivar o cambiar
// el rol de alguien se invalida de inmediato (olvidarEstadoUsuario), así que
// en la práctica el cambio aplica al instante.
const TTL_MS = 30_000;
const cache = new Map<string, EstadoUsuario>();

export async function obtenerEstadoUsuario(userId: string): Promise<EstadoUsuario | null> {
  const enCache = cache.get(userId);
  if (enCache && enCache.expira > Date.now()) return enCache;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true, sedeId: true } });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  const estado = { ...user, expira: Date.now() + TTL_MS };
  cache.set(userId, estado);
  return estado;
}

export function olvidarEstadoUsuario(userId: string) {
  cache.delete(userId);
}
