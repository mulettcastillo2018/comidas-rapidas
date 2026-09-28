import type { Pedido } from "./types";

// Misma regla que el backend (lib/tiempoEstimado.ts): cocina prepara en
// paralelo, así que el pedido está listo cuando termine el producto que más
// tarde acabe, contando desde que se empezó o, si no, desde que llegó.
export function estimarListoEn(pedido: Pedido): Date | null {
  const pendientes = pedido.items.filter((i) => i.estado === "RECIBIDO" || i.estado === "EN_PREPARACION");
  if (pendientes.length === 0) return null;
  const fin = Math.max(
    ...pendientes.map((i) => new Date(i.iniciadoEn ?? pedido.creadoEn).getTime() + i.tiempoPreparacionMinutos * 60_000)
  );
  return new Date(fin);
}

const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

export function formatoHora(fecha: Date | string): string {
  return hora.format(new Date(fecha));
}
