import { io, type Socket } from "socket.io-client";
import { cerrarSesionForzada } from "@/lib/sesion";
import { sedeElegida } from "@/lib/sedeElegida";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

// Acepta cualquier manejador tipado, p. ej. (mesa: Mesa) => void.
type Manejador = (payload: never) => void;

function crearConexion(token: string): Socket {
  const socket = io(API_URL, {
    // La sede decide qué cocina, meseros y pantalla escucha.
    auth: { token, sede: sedeElegida() },
    transports: ["websocket"],
  });
  // El servidor solo corta la conexión a propósito cuando la sesión dejó de
  // ser válida (usuario desactivado, con otro rol o de otra sede); una caída de red o un
  // reinicio del servidor llegan con otro motivo y se reconectan solos.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") cerrarSesionForzada("Tu sesión fue cerrada por un administrador.");
  });
  return socket;
}

// Una sola conexión por pestaña, compartida por la página y la campana de
// notificaciones (antes cada una abría la suya y se reconectaban en cada
// navegación).
let compartida: { token: string; socket: Socket; suscriptores: number; cierre?: ReturnType<typeof setTimeout> } | null = null;

function adquirir(token: string): Socket {
  if (compartida && compartida.token !== token) {
    compartida.socket.disconnect();
    compartida = null;
  }
  if (!compartida) compartida = { token, socket: crearConexion(token), suscriptores: 0 };
  clearTimeout(compartida.cierre);
  compartida.suscriptores++;
  return compartida.socket;
}

function liberar(socket: Socket) {
  if (!compartida || compartida.socket !== socket) return;
  compartida.suscriptores--;
  if (compartida.suscriptores > 0) return;
  // Al navegar, una página se desmonta justo antes de que monte la otra: se
  // espera un momento antes de cerrar para no reconectar en cada cambio.
  compartida.cierre = setTimeout(() => {
    if (compartida && compartida.suscriptores === 0) {
      compartida.socket.disconnect();
      compartida = null;
    }
  }, 3000);
}

// Escucha eventos en vivo; devuelve la función para dejar de escuchar (para
// el cleanup de un useEffect). "connect" se dispara también al reconectar:
// es el momento de recargar desde la API lo que se pudo perder mientras tanto.
export function suscribirEnVivo(token: string, manejadores: Record<string, Manejador>): () => void {
  const socket = adquirir(token);
  const pares = Object.entries(manejadores) as [string, (...args: unknown[]) => void][];
  for (const [evento, manejador] of pares) socket.on(evento, manejador);
  return () => {
    for (const [evento, manejador] of pares) socket.off(evento, manejador);
    liberar(socket);
  };
}
