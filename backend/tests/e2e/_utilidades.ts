import { io, type Socket } from "socket.io-client";
import { prisma } from "../../src/lib/prisma";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4001";

export const CUENTAS = {
  admin: process.env.E2E_ADMIN ?? "admin@comidasrapidas.test",
  mesero: process.env.E2E_MESERO ?? "mesero2_test@comidasrapidas.test",
  cocina: process.env.E2E_COCINA ?? "cocina_test@comidasrapidas.test",
};

// Estas pruebas crean y borran datos (mesas, pedidos, cuentas, cierres de
// caja de prueba): solo contra un entorno de desarrollo, nunca producción.
export function comprobarEntorno() {
  if (!process.env.E2E_PASSWORD) {
    throw new Error("Falta E2E_PASSWORD: la contraseña de las cuentas de prueba (no se guarda en el repositorio).");
  }
  const host = new URL(API_URL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && process.env.E2E_PERMITIR_REMOTO !== "1") {
    throw new Error(`E2E_API_URL apunta a ${host}. Estas pruebas crean y borran datos; si de verdad es un entorno de pruebas, usa E2E_PERMITIR_REMOTO=1.`);
  }
}

let fallos = 0;

export function verificar(condicion: unknown, mensaje: string) {
  console.log(`${condicion ? "  OK " : "  FALLA"} ${mensaje}`);
  if (!condicion) fallos++;
}

export const totalFallos = () => fallos;
export const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Respuesta de la API sin tipar: en una prueba interesa comparar valores.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Respuesta = { status: number; data: any };

export async function req(method: string, path: string, body?: unknown, token?: string): Promise<Respuesta> {
  const res = await fetch(API_URL + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Para pasos de preparación que tienen que salir bien: si fallan, la prueba
// se detiene con el código y el mensaje de la API en vez de seguir y
// terminar en un "undefined" difícil de rastrear.
export function exigir(r: Respuesta, paso: string): Respuesta["data"] {
  if (r.status < 200 || r.status >= 300) throw new Error(`${paso} falló con ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

export async function login(email: string): Promise<string> {
  const r = await req("POST", "/auth/login", { email, password: process.env.E2E_PASSWORD });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

export async function sesiones() {
  const [admin, mesero, cocina] = await Promise.all([login(CUENTAS.admin), login(CUENTAS.mesero), login(CUENTAS.cocina)]);
  const meseroId: string = (await req("GET", "/auth/me", undefined, mesero)).data.id;
  return { admin, mesero, cocina, meseroId };
}

export async function conectar(token: string): Promise<Socket> {
  const socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
  return socket;
}

// Lleva todos los productos pendientes de un pedido hasta "entregado", para
// que los pedidos de prueba no queden como tarjetas en tableros abiertos.
export async function despachar(pedidoId: string, tokens: { cocina: string; entrega: string }) {
  const items = await prisma.pedidoItem.findMany({ where: { pedidoId } });
  for (const item of items) {
    if (item.estado === "RECIBIDO") await req("PUT", `/pedidos/${pedidoId}/items/${item.id}/estado`, { estado: "EN_PREPARACION" }, tokens.cocina);
    if (item.estado === "RECIBIDO" || item.estado === "EN_PREPARACION") await req("PUT", `/pedidos/${pedidoId}/items/${item.id}/estado`, { estado: "LISTO" }, tokens.cocina);
    if (item.estado !== "ENTREGADO" && item.estado !== "CANCELADO") await req("PUT", `/pedidos/${pedidoId}/items/${item.id}/estado`, { estado: "ENTREGADO" }, tokens.entrega);
  }
}

// "200,409": para comparar resultados de peticiones simultáneas sin
// depender de cuál terminó primero.
export const estados = (respuestas: Respuesta[]) => respuestas.map((r) => r.status).sort().join(",");
