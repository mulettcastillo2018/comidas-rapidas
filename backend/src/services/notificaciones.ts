import { prisma } from "../lib/prisma";
import { emitNotificacion } from "../realtime/socket";
import type { NotificacionTipo, Role } from "@prisma/client";

interface NotificarUsuariosParams {
  userIds: string[];
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId?: string;
  pedidoItemId?: string;
  // A dónde lleva al hacer clic; ver enlaces.* abajo.
  enlace?: string;
}

// Destinos de las notificaciones. Los parámetros de la URL le dicen a esa
// pantalla qué resaltar (el pedido, el producto, la mesa o la solicitud).
export const enlaces = {
  cocina: (pedidoId: string, pedidoItemId?: string) =>
    `/cocina?pedido=${pedidoId}${pedidoItemId ? `&item=${pedidoItemId}` : ""}`,
  mesaAbierta: (mesaSesionId: string, pedidoItemId?: string) =>
    `/mesero/mesa/${mesaSesionId}${pedidoItemId ? `?item=${pedidoItemId}` : ""}`,
  grillaMesas: (mesaId: string) => `/mesero?mesa=${mesaId}`,
  mostrador: (solicitudId: string) => `/admin/mostrador?solicitud=${solicitudId}`,
  facturacion: (documentoId?: string) => `/admin/facturacion${documentoId ? `?documento=${documentoId}` : ""}`,
};

export async function notificarUsuarios(params: NotificarUsuariosParams) {
  const { userIds, tipo, mensaje, pedidoId, pedidoItemId, enlace } = params;
  if (userIds.length === 0) return;

  const creadas = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notificacion.create({
        data: { userId, tipo, mensaje, pedidoId, pedidoItemId, enlace },
      })
    )
  );
  for (const notificacion of creadas) {
    emitNotificacion(notificacion.userId, notificacion);
  }
}

interface NotificarPorRolParams {
  rol: Role;
  // De qué sede es el aviso: le llega al personal de esa sede (y, si es para
  // administradores, también a los generales). Sin sede: a todos los del rol.
  sedeId: string | null;
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId?: string;
  pedidoItemId?: string;
  enlace?: string;
}

// Filtro de usuarios de una sede: los de esa sede y, para administradores,
// los generales (sin sede), que ven todas.
export function deLaSede(sedeId: string | null, rol: Role) {
  if (!sedeId) return {};
  return rol === "ADMIN" ? { OR: [{ sedeId }, { sedeId: null }] } : { sedeId };
}

// Difunde a todo el personal activo de un rol (p. ej. toda la cocina cuando
// llega un pedido nuevo) — cada uno recibe su propia fila para poder marcarla
// leída de forma independiente.
export async function notificarPorRol(params: NotificarPorRolParams) {
  const { rol, sedeId, ...resto } = params;
  const usuarios = await prisma.user.findMany({ where: { role: rol, isActive: true, ...deLaSede(sedeId, rol) }, select: { id: true } });
  await notificarUsuarios({ userIds: usuarios.map((u) => u.id), ...resto });
}
