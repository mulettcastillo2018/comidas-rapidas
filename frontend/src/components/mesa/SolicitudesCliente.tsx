"use client";

import { conAdiciones } from "@/lib/items";
import type { SolicitudPedido } from "@/lib/types";

// Pedidos que el cliente armó desde el QR de la mesa y esperan que el mesero
// los confirme antes de ir a cocina.
export function SolicitudesCliente({
  solicitudes,
  resolviendoId,
  onConfirmar,
  onDescartar,
}: {
  solicitudes: SolicitudPedido[];
  resolviendoId: string | null;
  onConfirmar: (s: SolicitudPedido) => void;
  onDescartar: (s: SolicitudPedido) => void;
}) {
  if (solicitudes.length === 0) return null;
  return (
    <section className="mt-6 space-y-3 rounded-xl border-2 border-accent bg-accent/5 p-4">
      <h2 className="text-sm font-bold text-accent">
        🔔 El cliente ya dejó armado su pedido {solicitudes.length > 1 ? `(${solicitudes.length})` : ""}
      </h2>
      {solicitudes.map((solicitud) => (
        <div key={solicitud.id} className="rounded-lg border border-border bg-background p-3">
          {solicitud.nombreCliente ? <p className="text-xs text-muted-foreground">De: {solicitud.nombreCliente}</p> : null}
          <ul className="mt-1 space-y-1 text-sm">
            {solicitud.items.map((item) => (
              <li key={item.id} className={item.producto && !item.producto.disponible ? "text-red-600" : ""}>
                {item.cantidad}× {conAdiciones(item, item.producto?.nombre)}
                {item.producto?.esCombo ? ` (trae ${item.producto.componentes?.map((c) => c.producto.nombre).join(" + ")})` : ""}
                {item.paraLlevar ? " — 🥡 Para llevar" : ""}
                {item.notas ? ` (${item.notas})` : ""}
                {item.producto && !item.producto.disponible ? " — agotado" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onConfirmar(solicitud)}
              disabled={resolviendoId === solicitud.id}
              className="btn-primary flex-1 rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar y enviar a cocina
            </button>
            <button
              onClick={() => onDescartar(solicitud)}
              disabled={resolviendoId === solicitud.id}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Descartar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
