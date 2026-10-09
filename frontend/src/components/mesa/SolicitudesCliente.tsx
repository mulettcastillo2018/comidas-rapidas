"use client";

import { BellRing, ShoppingBag } from "lucide-react";
import { Boton, Insignia } from "@/components/ui";
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
    <section className="animate-aparecer rounded-3xl border border-accent/30 bg-accent/[0.05] p-5 ring-4 ring-accent/10 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-acento">
          <BellRing className="size-4 animate-pulse" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-accent">
          El cliente ya dejó armado su pedido {solicitudes.length > 1 ? `(${solicitudes.length})` : ""}
        </h2>
      </div>
      <div className="mt-4 grid gap-3">
        {solicitudes.map((solicitud) => (
          <div key={solicitud.id} className="rounded-2xl border border-border bg-surface p-4 shadow-suave">
            {solicitud.nombreCliente ? <p className="text-xs text-muted-foreground">De: {solicitud.nombreCliente}</p> : null}
            <ul className="mt-1.5 grid gap-1.5 text-sm">
              {solicitud.items.map((item) => {
                const agotado = Boolean(item.producto && !item.producto.disponible);
                return (
                  <li key={item.id} className={agotado ? "text-peligro" : ""}>
                    <span className="font-semibold tabular-nums">{item.cantidad}×</span> {conAdiciones(item, item.producto?.nombre)}
                    {item.producto?.esCombo ? ` (trae ${item.producto.componentes?.map((c) => c.producto.nombre).join(" + ")})` : ""}
                    {item.paraLlevar ? (
                      <Insignia tono="info" className="ml-1.5 align-middle">
                        <ShoppingBag aria-hidden /> Para llevar
                      </Insignia>
                    ) : null}
                    {item.notas ? <span className="text-muted-foreground"> ({item.notas})</span> : null}
                    {agotado ? <span className="font-semibold"> — agotado</span> : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Boton className="flex-1" onClick={() => onConfirmar(solicitud)} disabled={resolviendoId === solicitud.id}>
                Confirmar y enviar a cocina
              </Boton>
              <Boton variante="secundario" onClick={() => onDescartar(solicitud)} disabled={resolviendoId === solicitud.id}>
                Descartar
              </Boton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
