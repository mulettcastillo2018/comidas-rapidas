import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "../lib/jwt";
import { allowedOrigins } from "../lib/corsOrigins";
import { motivoTokenInvalido } from "../middleware/auth.middleware";
import { sinDatosInternos } from "../lib/datosInternos";
import { obtenerEstadoUsuario } from "../lib/estadoUsuario";
import { sedeDeTrabajo } from "../services/sedes";

let ioInstance: SocketIOServer | null = null;

// Salas por sede: la cocina, los meseros y la pantalla de un local solo
// reciben lo de su local.
const sala = (nombre: "cocina" | "meseros" | "pantalla", sedeId: string) => `${nombre}:${sedeId}`;

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
    const usuario = payload;
    motivoTokenInvalido(usuario)
      .then(async (motivo) => {
        if (motivo) {
          next(new Error(motivo));
          return;
        }
        const estado = await obtenerEstadoUsuario(usuario.userId);
        socket.data.user = usuario;
        // El administrador general indica la sede que está viendo.
        socket.data.sedeId = await sedeDeTrabajo(estado?.sedeId ?? null, socket.handshake.auth?.sede);
        next();
      })
      .catch(() => next(new Error("No se pudo verificar la sesión")));
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; role: string };
    const sedeId = socket.data.sedeId as string;
    if (user.role === "COCINA" || user.role === "ADMIN") socket.join(sala("cocina", sedeId));
    if (user.role === "MESERO" || user.role === "ADMIN") socket.join(sala("meseros", sedeId));
    if (user.role === "PANTALLA" || user.role === "ADMIN") socket.join(sala("pantalla", sedeId));
    socket.join(`user:${user.userId}`);
  });

  ioInstance = io;
  return io;
}

// La pantalla pública (un TV en el local) no necesita el teléfono del cliente.
function paraPantalla(pedido: unknown) {
  if (!pedido || typeof pedido !== "object") return pedido;
  const { telefonoCliente: _t, ...resto } = pedido as Record<string, unknown>;
  return resto;
}

// Personal (cocina, meseros, admin) recibe el pedido completo; la pantalla,
// sin datos personales. Quien está en ambas salas (el admin) lo recibe una vez.
function emitirPedido(evento: string, pedido: { sedeId: string } | null) {
  if (!pedido) return;
  const s = pedido.sedeId;
  ioInstance?.to(sala("cocina", s)).to(sala("meseros", s)).emit(evento, pedido);
  ioInstance?.to(sala("pantalla", s)).except([sala("cocina", s), sala("meseros", s)]).emit(evento, paraPantalla(pedido));
}

// Emite un pedido nuevo a cocina, a la pantalla pública y a los meseros (lo
// que no pasa por cocina, como las bebidas, nace listo para llevar a la mesa).
export function emitPedidoNuevo(pedido: { sedeId: string } | null) {
  emitirPedido("pedido:nuevo", pedido);
}

// Cocina marca un producto como agotado (o de nuevo disponible) en su sede:
// los meseros de esa sede lo ven al instante en su lista.
export function emitProductoActualizado(producto: object, sedeId: string) {
  // Sin datos internos (costo, inventario): solo los ve el admin por la API.
  ioInstance?.to(sala("meseros", sedeId)).to(sala("cocina", sedeId)).emit("producto:actualizado", sinDatosInternos(producto));
}

// Emite un cambio de estado de pedido a meseros (para que sepan cuándo
// entregar), cocina (por si hay varias estaciones) y la pantalla pública.
export function emitPedidoActualizado(pedido: { sedeId: string } | null) {
  emitirPedido("pedido:actualizado", pedido);
}

// Empuja una notificación puntual al usuario dueño (mesa que atiende, o
// cualquier miembro de cocina) — el centro de notificaciones del frontend
// la recibe en vivo sin tener que refrescar.
export function emitNotificacion(userId: string, notificacion: unknown) {
  ioInstance?.to(`user:${userId}`).emit("notificacion:nueva", notificacion);
}

// Corta en vivo las conexiones de un usuario (al desactivarlo o cambiarle el
// rol o la sede): sin esto seguiría recibiendo eventos hasta recargar.
export function desconectarUsuario(userId: string) {
  ioInstance?.in(`user:${userId}`).disconnectSockets(true);
}

// Los siguientes eventos mantienen la grilla de mesas de /mesero en tiempo
// real (antes solo se cargaba una vez al entrar a la página).
export function emitMesaActualizada<T extends { sedeId: string }>(mesa: T) {
  ioInstance?.to(sala("meseros", mesa.sedeId)).emit("mesa:actualizada", mesa);
}

export function emitMesaSesionNueva(sesion: { mesa: { sedeId: string } } | null) {
  if (sesion) ioInstance?.to(sala("meseros", sesion.mesa.sedeId)).emit("mesaSesion:nueva", sesion);
}

export function emitMesaSesionCerrada(payload: { mesaId: string; sesionId: string; sedeId: string }) {
  ioInstance?.to(sala("meseros", payload.sedeId)).emit("mesaSesion:cerrada", payload);
}

// El cliente tocó "Llamar al mesero" o "Pedir la cuenta" en el QR de su mesa:
// la grilla de mesas lo marca en vivo.
export function emitLlamadoMesa(llamado: { mesaId: string; tipo: "MESERO" | "CUENTA"; sedeId: string }) {
  ioInstance?.to(sala("meseros", llamado.sedeId)).emit("mesa:llamado", llamado);
}

export function emitSolicitudNueva(solicitud: { sedeId: string }) {
  ioInstance?.to(sala("meseros", solicitud.sedeId)).emit("solicitud:nueva", solicitud);
}

export function emitSolicitudActualizada(solicitud: { sedeId: string } | null) {
  if (solicitud) ioInstance?.to(sala("meseros", solicitud.sedeId)).emit("solicitud:actualizada", solicitud);
}
