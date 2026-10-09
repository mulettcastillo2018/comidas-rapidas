"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { reemplazarPedidoActivo } from "@/lib/pedidos";
import { formatoPesos } from "@/lib/formato";
import { RegistroPagos, type Cobro } from "@/components/RegistroPagos";
import { CLASE_RESALTADO, useResaltado } from "@/lib/resaltado";
import { estimarListoEn, formatoHora } from "@/lib/tiempoEstimado";
import { conAdiciones, etiquetaCombo } from "@/lib/items";
import { useAuthStore } from "@/store/auth.store";
import type { Pedido, SolicitudPedido } from "@/lib/types";

const ITEM_ESTADO_LABELS: Record<string, string> = {
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo para recoger",
  ENTREGADO: "Recogido",
  CANCELADO: "Cancelado",
};

export default function AdminMostradorPage() {
  const token = useAuthStore((state) => state.token);
  const [solicitudes, setSolicitudes] = useState<SolicitudPedido[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Al llegar desde la notificación de un pedido de mostrador.
  const [resaltado, lectorResaltado] = useResaltado(["solicitud"]);

  async function cargarSolicitudes() {
    if (!token) return;
    const data = await apiFetch<SolicitudPedido[]>("/solicitudes?estado=PENDIENTE", { token });
    setSolicitudes(data.filter((s) => !s.mesaId));
  }

  async function cargarPedidos() {
    if (!token) return;
    const data = await apiFetch<Pedido[]>("/pedidos/activos", { token });
    setPedidos(data.filter((p) => p.canal === "MOSTRADOR"));
  }

  useEffect(() => {
    if (!token) return;
    cargarSolicitudes();
    cargarPedidos();

    // Solo para recoger: los de mesa los atiende cada mesero, y domicilios y
    // apps tienen su propio módulo.
    const aplicarPedido = (p: Pedido) => {
      if (p.canal === "MOSTRADOR") setPedidos((prev) => reemplazarPedidoActivo(prev, p));
    };
    return suscribirEnVivo(token, {
      connect: () => {
        cargarSolicitudes();
        cargarPedidos();
      },
      "solicitud:nueva": (s: SolicitudPedido) => {
        if (!s.mesaId) setSolicitudes((prev) => [...prev.filter((x) => x.id !== s.id), s]);
      },
      "solicitud:actualizada": (s: SolicitudPedido) => setSolicitudes((prev) => prev.filter((x) => x.id !== s.id)),
      "pedido:nuevo": aplicarPedido,
      "pedido:actualizado": aplicarPedido,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleConfirmar(solicitud: SolicitudPedido, cobro: Cobro) {
    if (!token) return;
    setError(null);
    setConfirmandoId(solicitud.id);
    try {
      await apiFetch(`/solicitudes/${solicitud.id}/confirmar-recogida`, {
        method: "PUT",
        token,
        body: JSON.stringify(cobro),
      });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitud.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido.");
    } finally {
      setConfirmandoId(null);
    }
  }

  async function handleDescartar(solicitud: SolicitudPedido) {
    if (!token) return;
    setError(null);
    setConfirmandoId(solicitud.id);
    try {
      await apiFetch(`/solicitudes/${solicitud.id}/descartar`, { method: "PUT", token });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitud.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo descartar la solicitud.");
    } finally {
      setConfirmandoId(null);
    }
  }

  async function handleRecogido(pedido: Pedido) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(`/pedidos/${pedido.id}/estado`, { method: "PUT", token, body: JSON.stringify({ estado: "ENTREGADO" }) });
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar como recogido.");
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Pedidos de clientes sin mesa (QR de mostrador) — se atienden y se cobran aquí, en caja. Se actualiza solo.
      </p>
      {error ? <p className="text-sm text-peligro">{error}</p> : null}
      {lectorResaltado}

      <section>
        <h2 className="text-base font-semibold tracking-tight">Esperando confirmación en caja</h2>
        {solicitudes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No hay pedidos de mostrador esperando ahora mismo.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {solicitudes.map((solicitud) => {
              const total = solicitud.items.reduce((sum, i) => sum + (i.precioEstimado ?? i.producto?.precio ?? 0) * i.cantidad, 0);
              return (
                <div
                  key={solicitud.id}
                  data-resaltado={resaltado.solicitud === solicitud.id}
                  className={`rounded-xl border-2 border-accent bg-accent/5 p-4 ${resaltado.solicitud === solicitud.id ? CLASE_RESALTADO : ""}`}
                >
                  <p className="font-semibold">{solicitud.nombreCliente}</p>
                  <p className="text-xs text-muted-foreground">Tel: {solicitud.telefonoCliente}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {solicitud.items.map((item) => (
                      <li key={item.id}>
                        {item.cantidad}× {conAdiciones(item, item.producto?.nombre)}
                        {item.notas ? ` (${item.notas})` : ""}
                        {item.producto?.esCombo ? ` — trae ${item.producto.componentes?.map((c) => c.producto.nombre).join(" + ")}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm font-semibold">
                    Total: {formatoPesos(total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dile al cliente: estará listo en unos {Math.max(0, ...solicitud.items.map((i) => i.producto?.tiempoPreparacionMinutos ?? 0))} min
                    después de pagar. Puede seguirlo desde su celular.
                  </p>
                  <div className="mt-3 space-y-2">
                    <RegistroPagos
                      conCliente
                      total={total}
                      enviando={confirmandoId === solicitud.id}
                      textoBoton="Confirmar y cobrar"
                      onCobrar={(cobro) => handleConfirmar(solicitud, cobro)}
                    />
                    <button
                      onClick={() => handleDescartar(solicitud)}
                      disabled={confirmandoId === solicitud.id}
                      className="w-full rounded-xl border border-border px-4 py-1.5 text-sm text-muted-foreground"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold tracking-tight">En preparación / listos para recoger</h2>
        {pedidos.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No hay pedidos de mostrador activos en este momento.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pedidos.map((pedido) => (
              <div key={pedido.id} className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{pedido.nombreCliente}</p>
                    <p className="text-xs text-muted-foreground">Tel: {pedido.telefonoCliente}</p>
                  </div>
                  {estimarListoEn(pedido) ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                      Listo aprox. {formatoHora(estimarListoEn(pedido)!)}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {pedido.items
                    .filter((i) => i.estado !== "CANCELADO")
                    .map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2">
                        <span>
                          {item.cantidad}× {conAdiciones(item, item.producto?.nombre)}
                          {item.comboNombre ? <span className="ml-1 text-[11px] text-muted-foreground">{etiquetaCombo(item)}</span> : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ITEM_ESTADO_LABELS[item.estado] ?? item.estado}
                        </span>
                      </li>
                    ))}
                </ul>
                {pedido.estado === "LISTO" ? (
                  <button
                    onClick={() => handleRecogido(pedido)}
                    className="btn-primary mt-3 w-full rounded-xl px-3 py-1.5 text-xs"
                  >
                    Marcar como recogido
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
