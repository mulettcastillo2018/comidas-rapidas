"use client";

import { ITEM_ESTADO_LABEL, PEDIDO_ESTADO_LABEL } from "@/lib/estados";
import { CLASE_RESALTADO } from "@/lib/resaltado";
import { formatoHora } from "@/lib/tiempoEstimado";
import type { Comensal, Pedido, PedidoItem } from "@/lib/types";
import { etiquetaDestino } from "./NuevoPedido";

export function ListaPedidos({
  pedidos,
  comensales,
  esPropietario,
  nombreMesero,
  actualizandoItemId,
  actualizandoPedidoId,
  onEntregarItem,
  onCancelarItem,
  onEntregarPedido,
  onCancelarPedido,
  resaltarItemId,
}: {
  // Producto al que apuntaba la notificación con la que se llegó aquí.
  resaltarItemId?: string;
  pedidos: Pedido[];
  comensales: Comensal[];
  esPropietario: boolean;
  nombreMesero: string;
  actualizandoItemId: string | null;
  actualizandoPedidoId: string | null;
  onEntregarItem: (pedido: Pedido, item: PedidoItem) => void;
  onCancelarItem: (pedido: Pedido, item: PedidoItem) => void;
  onEntregarPedido: (pedido: Pedido) => void;
  onCancelarPedido: (pedido: Pedido) => void;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-bold">Pedidos de esta mesa</h2>
      {pedidos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no se ha enviado ningún pedido.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {pedidos.map((pedido) => (
            <div key={pedido.id} className={`rounded-xl border p-3 ${pedido.estado === "LISTO" ? "border-accent bg-accent/5" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pedido.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {PEDIDO_ESTADO_LABEL[pedido.estado] ?? pedido.estado}
                </span>
                <span className="text-xs text-muted-foreground">{formatoHora(pedido.creadoEn)}</span>
              </div>
              {pedido.origenCliente ? (
                <p className="mt-1 text-[11px] italic text-muted-foreground">
                  Agregado por el cliente desde el QR — validado por {nombreMesero || "el mesero"}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {pedido.items.map((item) => (
                  <li
                    key={item.id}
                    data-resaltado={item.id === resaltarItemId}
                    className={`space-y-1 rounded-md ${item.id === resaltarItemId ? `${CLASE_RESALTADO} p-1` : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={item.estado === "CANCELADO" ? "line-through" : ""}>
                        {item.cantidad}× {item.producto?.nombre} — {etiquetaDestino(comensales, item.comensalId, item.paraLlevar)}
                        {item.notas ? ` (${item.notas})` : ""}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ITEM_ESTADO_LABEL[item.estado] ?? item.estado}
                      </span>
                    </div>
                    {esPropietario && item.estado === "LISTO" ? (
                      <button
                        onClick={() => onEntregarItem(pedido, item)}
                        disabled={actualizandoItemId === item.id}
                        className="w-full rounded-full border border-accent px-2 py-1 text-[11px] font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actualizandoItemId === item.id ? "Entregando…" : "Entregar este producto"}
                      </button>
                    ) : null}
                    {esPropietario && (item.estado === "RECIBIDO" || item.estado === "EN_PREPARACION" || item.estado === "LISTO") ? (
                      <button
                        onClick={() => onCancelarItem(pedido, item)}
                        disabled={actualizandoItemId === item.id}
                        className="w-full rounded-full border border-red-600 px-2 py-1 text-[11px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancelar producto
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {esPropietario && pedido.estado === "LISTO" ? (
                <button
                  onClick={() => onEntregarPedido(pedido)}
                  disabled={actualizandoPedidoId === pedido.id}
                  className="btn-primary mt-2 w-full rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Marcar entregado
                </button>
              ) : null}
              {esPropietario && pedido.estado !== "ENTREGADO" && pedido.estado !== "CANCELADO" ? (
                <button
                  onClick={() => onCancelarPedido(pedido)}
                  disabled={actualizandoPedidoId === pedido.id}
                  className="mt-2 w-full rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar lo que falta del pedido
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
