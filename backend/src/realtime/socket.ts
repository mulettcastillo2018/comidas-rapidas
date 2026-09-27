import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "../lib/jwt";
import { allowedOrigins } from "../lib/corsOrigins";

let ioInstance: SocketIOServer | null = null;

export function createRealtimeServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigins },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("No autenticado"));
      return;
    }
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Token inválido o expirado"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; role: string };
    if (user.role === "COCINA" || user.role === "ADMIN") socket.join("cocina");
    if (user.role === "MESERO" || user.role === "ADMIN") socket.join("meseros");
    socket.join(`user:${user.userId}`);
  });

  ioInstance = io;
  return io;
}

// Emite un pedido nuevo a la pantalla de cocina.
export function emitPedidoNuevo(pedido: unknown) {
  ioInstance?.to("cocina").emit("pedido:nuevo", pedido);
}

// Emite un cambio de estado de pedido tanto a meseros (para que sepan cuándo
// entregar) como a cocina (por si hay varias estaciones/pantallas).
export function emitPedidoActualizado(pedido: unknown) {
  ioInstance?.to("meseros").to("cocina").emit("pedido:actualizado", pedido);
}

// Empuja una notificación puntual al usuario dueño (mesa que atiende, o
// cualquier miembro de cocina) — el centro de notificaciones del frontend
// la recibe en vivo sin tener que refrescar.
export function emitNotificacion(userId: string, notificacion: unknown) {
  ioInstance?.to(`user:${userId}`).emit("notificacion:nueva", notificacion);
}
