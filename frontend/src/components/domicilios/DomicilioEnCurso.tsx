"use client";

import { useState } from "react";
import { formatoHora } from "@/lib/tiempoEstimado";
import { formatoPesos } from "@/lib/formato";
import { METODO_PAGO_LABEL } from "@/lib/estados";
import { conAdiciones } from "@/lib/items";
import { etiquetaCanal } from "@/lib/pedidos";
import { RegistroPagos, type Cobro } from "@/components/RegistroPagos";
import type { Domicilio, Factura, Pedido } from "@/lib/types";

export interface PedidoDomicilio extends Pedido {
  domicilio: Domicilio | null;
  factura: (Factura & { pagos: { metodo: Factura["metodoPago"]; monto: number }[] }) | null;
}

function etapa(p: PedidoDomicilio): string {
  if (p.domicilio?.estado === "EN_CAMINO") return `🛵 En camino${p.domicilio.domiciliario ? ` con ${p.domicilio.domiciliario}` : ""}`;
  if (p.estado === "LISTO") return p.canal === "PLATAFORMA" ? "Listo: esperando al repartidor de la app" : "Listo para despachar";
  const listos = p.items.filter((i) => i.estado === "LISTO").length;
  const activos = p.items.filter((i) => i.estado !== "CANCELADO").length;
  return `En cocina (${listos}/${activos} listos)`;
}

export function DomicilioEnCurso({
  pedido,
  domiciliarios,
  ocupado,
  onDespachar,
  onEntregado,
  onFallido,
}: {
  pedido: PedidoDomicilio;
  domiciliarios: string[];
  ocupado: boolean;
  onDespachar: (domiciliario: string) => void;
  onEntregado: (cobro: Cobro | null) => void;
  onFallido: (motivo: string) => void;
}) {
  const [domiciliario, setDomiciliario] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const factura = pedido.factura;
  const pendienteDeCobro = factura?.estado === "PENDIENTE";
  const d = pedido.domicilio;
  const enCamino = d?.estado === "EN_CAMINO";

  return (
    <div className={`space-y-2 rounded-2xl border p-3 text-sm bg-surface shadow-suave ${pedido.estado === "LISTO" && !enCamino ? "border-2 border-accent" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {etiquetaCanal(pedido)} · {pedido.nombreCliente ?? "cliente"}
          </p>
          <p className="text-xs text-muted-foreground">
            Llegó {formatoHora(pedido.creadoEn)}
            {pedido.telefonoCliente ? ` · Tel: ${pedido.telefonoCliente}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{etapa(pedido)}</span>
      </div>

      {d ? (
        <p className="text-xs">
          📍 {d.direccion}
          {d.barrio ? `, ${d.barrio}` : ""}
          {d.indicaciones ? <span className="block text-muted-foreground">{d.indicaciones}</span> : null}
        </p>
      ) : null}

      <ul className="text-xs text-muted-foreground">
        {pedido.items
          .filter((i) => i.estado !== "CANCELADO")
          .map((i) => (
            <li key={i.id}>
              {i.cantidad}× {conAdiciones(i, i.producto?.nombre)}
              {i.notas ? ` (${i.notas})` : ""}
            </li>
          ))}
      </ul>

      {factura ? (
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span>
            Total <strong>{formatoPesos(factura.total)}</strong>
            {factura.envioMonto > 0 ? ` (incluye domicilio ${formatoPesos(factura.envioMonto)})` : ""}
          </span>
          <span className={pendienteDeCobro ? "font-semibold text-aviso" : "text-exito"}>
            {pendienteDeCobro
              ? d?.pagaCon
                ? `Cobrar al entregar · paga con ${formatoPesos(d.pagaCon)} → vueltas ${formatoPesos(Math.max(0, d.pagaCon - factura.total))}`
                : "Cobrar al entregar"
              : pedido.canal === "PLATAFORMA"
                ? `Lo cobró la app · comisión ${formatoPesos(factura.comisionMonto)}`
                : `Pagado (${factura.metodoPago ? METODO_PAGO_LABEL[factura.metodoPago] : "varios métodos"})`}
          </span>
        </div>
      ) : null}

      {pedido.estado === "LISTO" && !enCamino ? (
        pedido.canal === "PLATAFORMA" ? (
          <button onClick={() => onDespachar("")} disabled={ocupado} className="btn-primary w-full rounded-xl px-3 py-1.5 text-xs disabled:opacity-50">
            Entregado al repartidor de la app
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              value={domiciliario}
              onChange={(e) => setDomiciliario(e.target.value)}
              list="domiciliarios"
              placeholder="¿Quién lo lleva?"
              className="min-w-0 flex-1 rounded-xl border border-border px-2 py-1 text-xs"
            />
            <datalist id="domiciliarios">
              {domiciliarios.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button onClick={() => onDespachar(domiciliario.trim())} disabled={ocupado} className="btn-primary rounded-xl px-3 py-1.5 text-xs disabled:opacity-50">
              Salió
            </button>
          </div>
        )
      ) : null}

      {enCamino ? (
        <div className="space-y-2 border-t border-border pt-2">
          {d?.salioEn ? <p className="text-xs text-muted-foreground">Salió a las {formatoHora(d.salioEn)}</p> : null}
          {pendienteDeCobro && cobrando && factura ? (
            <RegistroPagos total={factura.total} enviando={ocupado} textoBoton="Entregado y cobrado" onCobrar={(cobro) => onEntregado(cobro)} />
          ) : (
            <button
              onClick={() => (pendienteDeCobro ? setCobrando(true) : onEntregado(null))}
              disabled={ocupado}
              className="btn-primary w-full rounded-xl px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {pendienteDeCobro ? "Ya lo entregó: registrar el cobro" : "Ya lo entregó"}
            </button>
          )}
          {motivo === null ? (
            <button onClick={() => setMotivo("")} className="w-full text-xs text-peligro">
              No se pudo entregar
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="¿Qué pasó? (no contestó, dirección errada...)"
                className="min-w-0 flex-1 rounded-xl border border-border px-2 py-1 text-xs"
              />
              <button
                onClick={() => onFallido(motivo.trim())}
                disabled={ocupado || motivo.trim().length < 3}
                className="rounded-full border border-peligro px-3 py-1 text-xs font-semibold text-peligro disabled:opacity-50"
              >
                Registrar
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
