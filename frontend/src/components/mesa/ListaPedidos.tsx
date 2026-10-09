"use client";

import { Clock, ClipboardList, QrCode, Tag } from "lucide-react";
import { Boton, CabeceraTarjeta, cx, Insignia } from "@/components/ui";
import { ESTADO_TONO, ITEM_ESTADO_LABEL, PEDIDO_ESTADO_LABEL } from "@/lib/estados";
import { CLASE_RESALTADO } from "@/lib/resaltado";
import { conAdiciones, etiquetaCombo } from "@/lib/items";
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
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-suave sm:p-6">
      <CabeceraTarjeta
        titulo="Pedidos de esta mesa"
        descripcion={pedidos.length ? `${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}` : undefined}
      />
      {pedidos.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <ClipboardList className="size-5 shrink-0" aria-hidden />
          Todavía no se ha enviado ningún pedido.
        </div>
      ) : (
        <ol className="mt-5 grid gap-3">
          {pedidos.map((pedido) => (
            <li
              key={pedido.id}
              className={cx(
                "rounded-2xl border p-4 transition-colors duration-300",
                pedido.estado === "LISTO" ? "border-exito/40 bg-exito/[0.05]" : "border-border bg-background/60",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Insignia tono={ESTADO_TONO[pedido.estado] ?? "neutro"}>{PEDIDO_ESTADO_LABEL[pedido.estado] ?? pedido.estado}</Insignia>
                <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <Clock className="size-3.5" aria-hidden />
                  {formatoHora(pedido.creadoEn)}
                </span>
              </div>
              {pedido.origenCliente ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground italic">
                  <QrCode className="size-3.5 shrink-0" aria-hidden />
                  Agregado por el cliente desde el QR — validado por {nombreMesero || "el mesero"}
                </p>
              ) : null}
              <ul className="mt-3 divide-y divide-border/70">
                {pedido.items.map((item) => {
                  const puedeCancelar = item.estado === "RECIBIDO" || item.estado === "EN_PREPARACION" || item.estado === "LISTO";
                  return (
                    <li
                      key={item.id}
                      data-resaltado={item.id === resaltarItemId}
                      className={cx("grid gap-2 py-2.5 first:pt-0 last:pb-0", item.id === resaltarItemId && `${CLASE_RESALTADO} rounded-xl p-2`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={cx("text-sm", item.estado === "CANCELADO" ? "text-muted-foreground line-through" : "text-foreground")}>
                          <span className="font-semibold tabular-nums">{item.cantidad}×</span> {conAdiciones(item, item.producto?.nombre)}
                          <span className="text-muted-foreground"> — {etiquetaDestino(comensales, item.comensalId, item.paraLlevar)}</span>
                          {item.notas ? <span className="text-muted-foreground"> ({item.notas})</span> : null}
                          {etiquetaCombo(item) ? <span className="ml-1 text-xs text-accent">{etiquetaCombo(item)}</span> : null}
                          {item.promocionNombre ? (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-exito">
                              <Tag className="size-3" aria-hidden /> {item.promocionNombre}
                            </span>
                          ) : null}
                        </span>
                        <Insignia tono={ESTADO_TONO[item.estado] ?? "neutro"} className="shrink-0">
                          {ITEM_ESTADO_LABEL[item.estado] ?? item.estado}
                        </Insignia>
                      </div>
                      {esPropietario && (item.estado === "LISTO" || puedeCancelar) ? (
                        <div className="flex flex-wrap gap-2">
                          {item.estado === "LISTO" ? (
                            <Boton tamano="sm" variante="exito" onClick={() => onEntregarItem(pedido, item)} disabled={actualizandoItemId === item.id}>
                              {actualizandoItemId === item.id ? "Entregando…" : "Entregar este producto"}
                            </Boton>
                          ) : null}
                          {puedeCancelar ? (
                            <Boton tamano="sm" variante="peligroSuave" onClick={() => onCancelarItem(pedido, item)} disabled={actualizandoItemId === item.id}>
                              Cancelar producto
                            </Boton>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {esPropietario && pedido.estado !== "ENTREGADO" && pedido.estado !== "CANCELADO" ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row">
                  {pedido.estado === "LISTO" ? (
                    <Boton className="flex-1" onClick={() => onEntregarPedido(pedido)} disabled={actualizandoPedidoId === pedido.id}>
                      Marcar entregado
                    </Boton>
                  ) : null}
                  <Boton variante="peligroSuave" className="flex-1" onClick={() => onCancelarPedido(pedido)} disabled={actualizandoPedidoId === pedido.id}>
                    Cancelar lo que falta del pedido
                  </Boton>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
