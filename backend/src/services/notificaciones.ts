import { prisma } from "../lib/prisma";
import { emitNotificacion } from "../realtime/socket";
import type { NotificacionTipo, Role } from "@prisma/client";

interface NotificarUsuariosParams {
  userIds: string[];
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId?: string;
  pedidoItemId?: string;
}

export async function notificarUsuarios(params: NotificarUsuariosParams) {
  const { userIds, tipo, mensaje, pedidoId, pedidoItemId } = params;
  if (userIds.length === 0) return;

  const creadas = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notificacion.create({
        data: { userId, tipo, mensaje, pedidoId, pedidoItemId },
      })
    )
  );
  for (const notificacion of creadas) {
    emitNotificacion(notificacion.userId, notificacion);
  }
}

interface NotificarPorRolParams {
  rol: Role;
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId?: string;
  pedidoItemId?: string;
}

// Difunde a todo el personal activo de un rol (p. ej. toda la cocina cuando
// llega un pedido nuevo) — cada uno recibe su propia fila para poder marcarla
// leída de forma independiente.
export async function notificarPorRol(params: NotificarPorRolParams) {
  const { rol, ...resto } = params;
  const usuarios = await prisma.user.findMany({ where: { role: rol, isActive: true }, select: { id: true } });
  await notificarUsuarios({ userIds: usuarios.map((u) => u.id), ...resto });
}
