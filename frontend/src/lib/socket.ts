import { io, type Socket } from "socket.io-client";
import { cerrarSesionForzada } from "@/lib/sesion";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export function createSocket(token: string): Socket {
  const socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });
  // El servidor solo corta la conexión a propósito cuando la sesión dejó de
  // ser válida (usuario desactivado o con otro rol); una caída de red o un
  // reinicio del servidor llegan con otro motivo y se reconectan solos.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") cerrarSesionForzada("Tu sesión fue cerrada por un administrador.");
  });
  return socket;
}
