import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "../lib/jwt";
import { allowedOrigins } from "../lib/corsOrigins";
import { motivoTokenInvalido } from "../middleware/auth.middleware";
import { sinDatosInternos } from "../lib/datosInternos";

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
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      next(new Error("Token inválido o expirado"));
      return;
    }
    motivoTokenInvalido(payload)
      .then((motivo) => {
        if (motivo) {
          next(new Error(motivo));
          return;
        }
        socket.data.user = payload;
        next();
      })
      .catch(() => next(new Error("No se pudo verificar la sesión")));
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; role: string };
    if (user.role === "COCINA" || user.role === "ADMIN") socket.join("cocina");
    if (user.role === "MESERO" || user.role === "ADMIN") socket.join("meseros");
    if (user.role === "PANTALLA" || user.role === "ADMIN") socket.join("pantalla");
    socket.join(`user:${user.userId}`);
  });

  ioInstance = io;
  return io;
}

// Emite un pedido nuevo a cocina, a la pantalla pública y a los meseros (lo
// que no pasa por cocina, como las bebidas, nace listo para llevar a la mesa).
export function emitPedidoNuevo(pedido: unknown) {
  ioInstance?.to("cocina").to("pantalla").to("meseros").emit("pedido:nuevo", pedido);
}

// Cocina marca un producto como agotado (o de nuevo disponible): los meseros
// lo ven al instante en su lista en vez de ofrecerlo y que luego falle.
export function emitProductoActualizado(producto: object) {
  // Sin datos internos (costo, inventario): solo los ve el admin por la API.
  ioInstance?.to("meseros").to("cocina").emit("producto:actualizado", sinDatosInternos(producto));
}

// Emite un cambio de estado de pedido a meseros (para que sepan cuándo
// entregar), cocina (por si hay varias estaciones) y la pantalla pública.
export function emitPedidoActualizado(pedido: unknown) {
  ioInstance?.to("meseros").to("cocina").to("pantalla").emit("pedido:actualizado", pedido);
}

// Empuja una notificación puntual al usuario dueño (mesa que atiende, o
// cualquier miembro de cocina) — el centro de notificaciones del frontend
// la recibe en vivo sin tener que refrescar.
export function emitNotificacion(userId: string, notificacion: unknown) {
  ioInstance?.to(`user:${userId}`).emit("notificacion:nueva", notificacion);
}

// Corta en vivo las conexiones de un usuario (al desactivarlo o cambiarle el
// rol): sin esto seguiría recibiendo eventos hasta recargar la página.
export function desconectarUsuario(userId: string) {
  ioInstance?.in(`user:${userId}`).disconnectSockets(true);
}

// Los siguientes eventos mantienen la grilla de mesas de /mesero en tiempo
// real (antes solo se cargaba una vez al entrar a la página).
export function emitMesaActualizada(mesa: unknown) {
  ioInstance?.to("meseros").emit("mesa:actualizada", mesa);
}

export function emitMesaSesionNueva(sesion: unknown) {
  ioInstance?.to("meseros").emit("mesaSesion:nueva", sesion);
}

export function emitMesaSesionCerrada(payload: { mesaId: string; sesionId: string }) {
  ioInstance?.to("meseros").emit("mesaSesion:cerrada", payload);
}

// El cliente tocó "Llamar al mesero" o "Pedir la cuenta" en el QR de su mesa:
// la grilla de mesas lo marca en vivo.
export function emitLlamadoMesa(llamado: { mesaId: string; tipo: "MESERO" | "CUENTA" }) {
  ioInstance?.to("meseros").emit("mesa:llamado", llamado);
}

export function emitSolicitudNueva(solicitud: unknown) {
  ioInstance?.to("meseros").emit("solicitud:nueva", solicitud);
}

export function emitSolicitudActualizada(solicitud: unknown) {
  ioInstance?.to("meseros").emit("solicitud:actualizada", solicitud);
}
