"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { resolverImagenUrl } from "@/lib/images";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import type { Factura, MesaSesion, MetodoPago, Pedido, Producto, SolicitudPedido } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

const ESTADO_LABELS: Record<string, string> = {
  RECIBIDO: "Recibido en cocina",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const ITEM_ESTADO_LABELS: Record<string, string> = {
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

interface DraftItem {
  productoId: string;
  comensalId: string | null;
  paraLlevar: boolean;
  cantidad: number;
  notas: string;
}

export default function MesaSesionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [sesion, setSesion] = useState<MesaSesion | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudPedido[]>([]);
  const [resolviendoSolicitudId, setResolviendoSolicitudId] = useState<string | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [selectedProductoId, setSelectedProductoId] = useState("");
  const [selectedComensalId, setSelectedComensalId] = useState<string>("compartir");
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPedidoId, setUpdatingPedidoId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [propina, setPropina] = useState(0);
  const [solicitandoCuenta, setSolicitandoCuenta] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [pagando, setPagando] = useState(false);

  async function loadSesion() {
    if (!token) return;
    const data = await apiFetch<MesaSesion>(`/mesa-sesiones/${id}`, { token });
    setSesion(data);
  }

  async function loadSolicitudes() {
    if (!token) return;
    const data = await apiFetch<SolicitudPedido[]>("/solicitudes?estado=PENDIENTE", { token });
    setSolicitudes(data);
  }

  useEffect(() => {
    if (!token) return;
    loadSesion();
    loadSolicitudes();
    apiFetch<Producto[]>("/productos", { token }).then((data) => {
      setProductos(data);
      setSelectedProductoId(data[0]?.id ?? "");
    });

    const socket = createSocket(token);
    // Si el socket se desconecta (reinicio del servidor, wifi, etc.) podemos
    // perdernos eventos mientras tanto; al reconectar volvemos a sincronizar
    // contra la API en vez de quedarnos con datos viejos en pantalla.
    socket.on("connect", () => {
      loadSesion();
      loadSolicitudes();
    });
    socket.on("pedido:actualizado", (pedido: Pedido) => {
      if (pedido.mesaSesionId !== id) return;
      setSesion((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos?.map((p) => (p.id === pedido.id ? pedido : p)) } : prev
      );
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function handleSolicitarCuenta() {
    if (!token) return;
    setError(null);
    setSolicitandoCuenta(true);
    try {
      await apiFetch<Factura>("/facturas", { method: "POST", token, body: JSON.stringify({ mesaSesionId: id, propinaMonto: propina }) });
      await loadSesion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la factura.");
    } finally {
      setSolicitandoCuenta(false);
    }
  }

  async function handleMarcarPagada() {
    if (!token || !sesion?.factura) return;
    setError(null);
    setPagando(true);
    try {
      await apiFetch(`/facturas/${sesion.factura.id}/pagar`, { method: "PUT", token, body: JSON.stringify({ metodoPago }) });
      showToast("Cuenta pagada, mesa liberada");
      router.push("/mesero");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar la factura como pagada.");
    } finally {
      setPagando(false);
    }
  }

  async function handleMarcarPerdida() {
    if (!token || !sesion?.factura) return;
    if (!confirm("¿Confirmas que el cliente se fue sin pagar? Esto cierra la mesa y deja registrada la pérdida.")) return;
    setError(null);
    setPagando(true);
    try {
      await apiFetch(`/facturas/${sesion.factura.id}/marcar-perdida`, { method: "PUT", token });
      showToast("Cuenta registrada como pérdida, mesa liberada");
      router.push("/mesero");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la pérdida.");
    } finally {
      setPagando(false);
    }
  }

  async function marcarEntregado(pedidoId: string) {
    if (!token) return;
    setUpdatingPedidoId(pedidoId);
    try {
      const pedidoActualizado = await apiFetch<Pedido>(`/pedidos/${pedidoId}/estado`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado: "ENTREGADO" }),
      });
      // Igual que en /cocina: aplicamos la respuesta directamente en vez de
      // esperar al evento de socket, para que el botón no quede un instante
      // mostrando el estado viejo y evitar un doble clic que reenvíe la
      // misma transición ya aplicada.
      setSesion((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos?.map((p) => (p.id === pedidoActualizado.id ? pedidoActualizado : p)) } : prev
      );
      showToast("Pedido entregado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar como entregado.");
    } finally {
      setUpdatingPedidoId(null);
    }
  }

  // Entrega producto por producto: no hace falta esperar a que TODOS los
  // productos del pedido estén listos para empezar a llevarlos a la mesa.
  async function marcarItemEntregado(pedidoId: string, itemId: string) {
    if (!token) return;
    setUpdatingItemId(itemId);
    try {
      const pedidoActualizado = await apiFetch<Pedido>(`/pedidos/${pedidoId}/items/${itemId}/estado`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado: "ENTREGADO" }),
      });
      setSesion((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos?.map((p) => (p.id === pedidoActualizado.id ? pedidoActualizado : p)) } : prev
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar el producto como entregado.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  // Cancelación parcial: un solo producto (ej. alguien de la mesa se fue y ya
  // no quiere lo que pidió). Si cocina ya lo estaba preparando o ya lo tenía
  // listo, se le avisa para que no siga invirtiendo tiempo en algo cancelado.
  async function cancelarItem(pedidoId: string, itemId: string, estadoActual: string, nombreProducto: string) {
    if (!token) return;
    const advertencia =
      estadoActual === "RECIBIDO"
        ? `¿Cancelar ${nombreProducto}?`
        : `${nombreProducto} ya está ${estadoActual === "EN_PREPARACION" ? "en preparación" : "listo"} en cocina. ¿Seguro que quieres cancelarlo?`;
    if (!confirm(advertencia)) return;

    setUpdatingItemId(itemId);
    try {
      const pedidoActualizado = await apiFetch<Pedido>(`/pedidos/${pedidoId}/items/${itemId}/estado`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado: "CANCELADO" }),
      });
      setSesion((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos?.map((p) => (p.id === pedidoActualizado.id ? pedidoActualizado : p)) } : prev
      );
      showToast("Producto cancelado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar el producto.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  // Cancelación completa del pedido/ticket (todos sus productos a la vez).
  async function cancelarPedido(pedidoId: string) {
    if (!token) return;
    if (!confirm("¿Cancelar este pedido completo? Se cancelan todos sus productos.")) return;

    setUpdatingPedidoId(pedidoId);
    try {
      const pedidoActualizado = await apiFetch<Pedido>(`/pedidos/${pedidoId}/estado`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado: "CANCELADO" }),
      });
      setSesion((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos?.map((p) => (p.id === pedidoActualizado.id ? pedidoActualizado : p)) } : prev
      );
      showToast("Pedido cancelado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar el pedido.");
    } finally {
      setUpdatingPedidoId(null);
    }
  }

  function addDraftItem() {
    if (!selectedProductoId) return;
    setDraftItems((prev) => [
      ...prev,
      {
        productoId: selectedProductoId,
        comensalId: selectedComensalId === "compartir" || selectedComensalId === "llevar" ? null : selectedComensalId,
        paraLlevar: selectedComensalId === "llevar",
        cantidad,
        notas: notas.trim(),
      },
    ]);
    setCantidad(1);
    setNotas("");
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  function nombreProducto(productoId: string) {
    return productos.find((p) => p.id === productoId)?.nombre ?? "Producto";
  }

  function nombreComensal(comensalId: string | null, paraLlevar?: boolean) {
    if (paraLlevar) return "🥡 Para llevar";
    if (!comensalId) return "Para compartir";
    return sesion?.comensales?.find((c) => c.id === comensalId)?.nombre ?? "—";
  }

  async function handleEnviarPedido() {
    if (!token || draftItems.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/pedidos", {
        method: "POST",
        token,
        body: JSON.stringify({
          mesaSesionId: id,
          items: draftItems.map((item) => ({
            productoId: item.productoId,
            comensalId: item.comensalId,
            paraLlevar: item.paraLlevar,
            cantidad: item.cantidad,
            notas: item.notas || null,
          })),
        }),
      });
      setDraftItems([]);
      showToast("Pedido enviado a cocina");
      await loadSesion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmarSolicitud(solicitud: SolicitudPedido) {
    if (!token) return;
    setError(null);
    setResolviendoSolicitudId(solicitud.id);
    try {
      await apiFetch(`/solicitudes/${solicitud.id}/confirmar`, { method: "PUT", token });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitud.id));
      showToast("Pedido del cliente confirmado y enviado a cocina");
      await loadSesion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido del cliente.");
    } finally {
      setResolviendoSolicitudId(null);
    }
  }

  async function descartarSolicitud(solicitud: SolicitudPedido) {
    if (!token) return;
    setError(null);
    setResolviendoSolicitudId(solicitud.id);
    try {
      await apiFetch(`/solicitudes/${solicitud.id}/descartar`, { method: "PUT", token });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitud.id));
      showToast("Solicitud descartada");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo descartar la solicitud.");
    } finally {
      setResolviendoSolicitudId(null);
    }
  }

  if (!sesion) return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">Cargando…</div>;

  const esPropietario = sesion.meseroId === user?.id || user?.role === "ADMIN";
  const solicitudesDeEstaMesa = solicitudes.filter((s) => s.mesaId === sesion.mesaId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">
        Mesa {sesion.mesa?.numero} — {sesion.nombreResponsable}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Comensales: {sesion.comensales?.map((c) => c.nombre).join(", ")}
      </p>

      {!esPropietario ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Esta mesa la está atendiendo <strong>{nombreCompleto(sesion.mesero)}</strong>. Solo puedes verla, no gestionarla.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {esPropietario && solicitudesDeEstaMesa.length > 0 ? (
        <section className="mt-6 space-y-3 rounded-xl border-2 border-accent bg-accent/5 p-4">
          <h2 className="text-sm font-bold text-accent">
            🔔 El cliente ya dejó armado su pedido {solicitudesDeEstaMesa.length > 1 ? `(${solicitudesDeEstaMesa.length})` : ""}
          </h2>
          {solicitudesDeEstaMesa.map((solicitud) => (
            <div key={solicitud.id} className="rounded-lg border border-border bg-background p-3">
              {solicitud.nombreCliente ? (
                <p className="text-xs text-muted-foreground">De: {solicitud.nombreCliente}</p>
              ) : null}
              <ul className="mt-1 space-y-1 text-sm">
                {solicitud.items.map((item) => (
                  <li key={item.id}>
                    {item.cantidad}× {item.producto?.nombre}
                    {item.paraLlevar ? " — 🥡 Para llevar" : ""}
                    {item.notas ? ` (${item.notas})` : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => confirmarSolicitud(solicitud)}
                  disabled={resolviendoSolicitudId === solicitud.id}
                  className="btn-primary flex-1 rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar y enviar a cocina
                </button>
                <button
                  onClick={() => descartarSolicitud(solicitud)}
                  disabled={resolviendoSolicitudId === solicitud.id}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {esPropietario ? (
      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">Nuevo pedido</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Producto</label>
            <div className="flex items-center gap-2">
              {(() => {
                const imagen = resolverImagenUrl(productos.find((p) => p.id === selectedProductoId)?.imagenUrl);
                return imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagen} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                ) : null;
              })()}
              <select
                value={selectedProductoId}
                onChange={(e) => setSelectedProductoId(e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                {productos.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.disponible}>
                    {p.nombre} — {formatCOP(p.precio)} {!p.disponible ? "(agotado)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Cantidad</label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
              className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Para</label>
            <select
              value={selectedComensalId}
              onChange={(e) => setSelectedComensalId(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              <option value="compartir">Para compartir</option>
              <option value="llevar">🥡 Para llevar</option>
              {sesion.comensales?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Notas (opcional)</label>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. sin cebolla"
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <button onClick={addDraftItem} className="rounded-full border border-accent px-4 py-1.5 text-sm font-semibold text-accent">
            + Agregar
          </button>
        </div>

        {draftItems.length > 0 ? (
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            {draftItems.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {item.cantidad}× {nombreProducto(item.productoId)} — {nombreComensal(item.comensalId, item.paraLlevar)}
                  {item.notas ? ` (${item.notas})` : ""}
                </span>
                <button onClick={() => removeDraftItem(index)} className="text-muted-foreground hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={handleEnviarPedido}
              disabled={submitting}
              className="btn-primary mt-2 w-full rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Enviando…" : "Enviar pedido a cocina"}
            </button>
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-bold">Pedidos de esta mesa</h2>
        {!sesion.pedidos || sesion.pedidos.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Todavía no se ha enviado ningún pedido.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sesion.pedidos.map((pedido) => (
              <div
                key={pedido.id}
                className={`rounded-xl border p-3 ${pedido.estado === "LISTO" ? "border-accent bg-accent/5" : "border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      pedido.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ESTADO_LABELS[pedido.estado] ?? pedido.estado}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-CO", { timeStyle: "short" }).format(new Date(pedido.creadoEn))}
                  </span>
                </div>
                {pedido.origenCliente ? (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    Agregado por el cliente desde el QR — validado por {nombreCompleto(sesion.mesero) || "el mesero"}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {pedido.items.map((item) => (
                    <li key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {item.cantidad}× {item.producto?.nombre} — {nombreComensal(item.comensalId, item.paraLlevar)}
                          {item.notas ? ` (${item.notas})` : ""}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ITEM_ESTADO_LABELS[item.estado] ?? item.estado}
                        </span>
                      </div>
                      {esPropietario && item.estado === "LISTO" ? (
                        <button
                          onClick={() => marcarItemEntregado(pedido.id, item.id)}
                          disabled={updatingItemId === item.id}
                          className="w-full rounded-full border border-accent px-2 py-1 text-[11px] font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updatingItemId === item.id ? "Entregando…" : "Entregar este producto"}
                        </button>
                      ) : null}
                      {esPropietario && (item.estado === "RECIBIDO" || item.estado === "EN_PREPARACION" || item.estado === "LISTO") ? (
                        <button
                          onClick={() => cancelarItem(pedido.id, item.id, item.estado, item.producto?.nombre ?? "este producto")}
                          disabled={updatingItemId === item.id}
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
                    onClick={() => marcarEntregado(pedido.id)}
                    disabled={updatingPedidoId === pedido.id}
                    className="btn-primary mt-2 w-full rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Marcar entregado
                  </button>
                ) : null}
                {esPropietario && pedido.estado !== "ENTREGADO" && pedido.estado !== "CANCELADO" ? (
                  <button
                    onClick={() => cancelarPedido(pedido.id)}
                    disabled={updatingPedidoId === pedido.id}
                    className="mt-2 w-full rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar pedido completo
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {esPropietario ? (
      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">Cuenta</h2>
        {sesion.factura ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCOP(sesion.factura.subtotal)}</span>
            </div>
            {sesion.factura.propinaMonto > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Propina</span>
                <span>{formatCOP(sesion.factura.propinaMonto)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCOP(sesion.factura.total)}</span>
            </div>

            {sesion.factura.estado === "PAGADA" ? (
              <p className="mt-2 text-center text-sm font-semibold text-accent">Cuenta pagada</p>
            ) : sesion.factura.estado === "PERDIDA" ? (
              <p className="mt-2 text-center text-sm font-semibold text-red-600">Cuenta registrada como pérdida</p>
            ) : (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                    className="rounded-lg border border-border px-2 py-1.5 text-sm"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <button
                    onClick={handleMarcarPagada}
                    disabled={pagando}
                    className="btn-primary flex-1 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pagando ? "Guardando…" : "Marcar como pagada y cerrar mesa"}
                  </button>
                </div>
                <button
                  onClick={handleMarcarPerdida}
                  disabled={pagando}
                  className="w-full rounded-full border border-red-600 px-4 py-1.5 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cliente se fue sin pagar
                </button>
              </div>
            )}
          </div>
        ) : sesion.pedidos && sesion.pedidos.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Propina (opcional)</label>
              <input
                type="number"
                min={0}
                value={propina}
                onChange={(e) => setPropina(Math.max(0, Number(e.target.value)))}
                className="w-32 rounded-lg border border-border px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={handleSolicitarCuenta}
              disabled={solicitandoCuenta}
              className="btn-primary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {solicitandoCuenta ? "Generando…" : "Solicitar cuenta"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Envía al menos un pedido antes de poder generar la cuenta.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}
