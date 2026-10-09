"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Clock, ShoppingBag, StickyNote } from "lucide-react";
import { Boton, Contenedor, cx, EncabezadoPagina, Insignia, PuntoVivo, type TonoInsignia } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { estaAtrasado, etiquetaCanal, reemplazarPedidoActivo, ubicacionPedido } from "@/lib/pedidos";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { PanelDisponibilidad } from "@/components/cocina/PanelDisponibilidad";
import { CLASE_RESALTADO, useResaltado } from "@/lib/resaltado";
import { etiquetaCombo } from "@/lib/items";
import type { Pedido, PedidoItem, Producto } from "@/lib/types";

// Cada columna lleva el color de su estado (el mismo de ESTADO_TONO en todo el sistema).
const COLUMNAS: { estado: "RECIBIDO" | "EN_PREPARACION" | "LISTO"; titulo: string; tono: TonoInsignia; barra: string }[] = [
  { estado: "RECIBIDO", titulo: "Recibido", tono: "info", barra: "bg-info" },
  { estado: "EN_PREPARACION", titulo: "En preparación", tono: "aviso", barra: "bg-aviso" },
  { estado: "LISTO", titulo: "Listo — falta despachar", tono: "exito", barra: "bg-exito" },
];

interface ItemConContexto extends PedidoItem {
  pedido: Pedido;
}

export default function CocinaPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cambiandoProductoId, setCambiandoProductoId] = useState<string | null>(null);
  // Al llegar desde una notificación: el pedido (o el producto puntual, si
  // es un aviso de retraso) se resalta unos segundos.
  const [resaltado, lectorResaltado] = useResaltado(["pedido", "item"]);
  const estaResaltado = (item: ItemConContexto) =>
    resaltado.item ? item.id === resaltado.item : Boolean(resaltado.pedido) && item.pedidoId === resaltado.pedido;

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    const cargarProductos = () => apiFetch<Producto[]>("/productos", { token }).then(setProductos);
    cargarPedidos();
    cargarProductos();

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con pedidos viejos en pantalla.
    return suscribirEnVivo(token, {
      connect: () => {
        cargarPedidos();
        cargarProductos();
      },
      "pedido:nuevo": (pedido: Pedido) => {
        setPedidos((prev) => [...prev.filter((p) => p.id !== pedido.id), pedido]);
        // Un pedido de solo bebidas no le toca a cocina: no se anuncia.
        if (!pedido.items.some((i) => i.estado === "RECIBIDO")) return;
        showToast(`Nuevo pedido — ${ubicacionPedido(pedido)}`);
      },
      "pedido:actualizado": (pedido: Pedido) => setPedidos((prev) => reemplazarPedidoActivo(prev, pedido)),
      "producto:actualizado": (producto: Producto) => setProductos((prev) => prev.map((p) => (p.id === producto.id ? producto : p))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Revisa cada 15s si algún producto se pasó de su tiempo, para que la
  // alerta visual aparezca sin necesidad de refrescar la página.
  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const itemsPorColumna = useMemo(() => {
    const grupos: Record<string, ItemConContexto[]> = { RECIBIDO: [], EN_PREPARACION: [], LISTO: [] };
    for (const pedido of pedidos) {
      for (const item of pedido.items) {
        if (item.estado === "CANCELADO") continue;
        // Bebidas y empacados los despacha el mesero directo.
        if (item.producto && !item.producto.requiereCocina) continue;
        if (!grupos[item.estado]) continue;
        grupos[item.estado].push({ ...item, pedido });
      }
    }
    return grupos;
  }, [pedidos]);

  async function avanzarItem(item: ItemConContexto, estado: "EN_PREPARACION" | "LISTO") {
    if (!token) return;
    setError(null);
    setUpdatingItemId(item.id);
    try {
      const pedidoActualizado = await apiFetch<Pedido>(`/pedidos/${item.pedidoId}/items/${item.id}/estado`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado }),
      });
      // No esperamos al evento de socket para reflejar el cambio: si se
      // espera, la pantalla queda unos instantes mostrando el botón viejo
      // (mismo estado, mismo item) y un doble clic o un refresco lento del
      // socket puede reenviar la misma transición ya aplicada — eso era lo
      // que producía el error "no se puede pasar de EN_PREPARACION a
      // EN_PREPARACION". Aplicamos la respuesta de una vez.
      setPedidos((prev) => prev.map((p) => (p.id === pedidoActualizado.id ? pedidoActualizado : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el producto.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function cambiarDisponibilidad(producto: Producto) {
    if (!token) return;
    const nuevo = !producto.disponible;
    if (!nuevo && !confirm(`¿Marcar ${producto.nombre} como agotado? Los meseros ya no podrán pedirlo y sale de la carta del QR.`)) return;
    setError(null);
    setCambiandoProductoId(producto.id);
    try {
      const actualizado = await apiFetch<Producto>(`/productos/${producto.id}/disponible`, {
        method: "PUT",
        token,
        body: JSON.stringify({ disponible: nuevo }),
      });
      setProductos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
      showToast(nuevo ? `${producto.nombre} disponible de nuevo` : `${producto.nombre} marcado como agotado`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la disponibilidad.");
    } finally {
      setCambiandoProductoId(null);
    }
  }

  if (!user || (user.role !== "COCINA" && user.role !== "ADMIN")) {
    return (
      <Contenedor ancho="medio" className="text-center">
        <p className="text-muted-foreground">Esta sección es solo para cocina.</p>
      </Contenedor>
    );
  }

  return (
    <Contenedor ancho="total">
      <EncabezadoPagina
        antetitulo="Cocina"
        titulo="Tablero de cocina"
        descripcion="Cada producto se despacha por separado. Si algo se demora más de lo esperado, se marca en rojo — revisa si de verdad va atrasado o si ya salió y falta confirmarlo aquí."
        acciones={
          <Insignia tono="exito" className="px-3 py-1">
            <PuntoVivo tono="exito" /> En vivo
          </Insignia>
        }
      />
      {error ? (
        <p role="alert" className="mt-5 rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm font-medium text-peligro ring-1 ring-peligro/20 ring-inset">
          {error}
        </p>
      ) : null}

      {lectorResaltado}
      <PanelDisponibilidad productos={productos} cambiando={cambiandoProductoId} onCambiar={cambiarDisponibilidad} />

      <div className="mt-6 grid grid-cols-1 items-start gap-4 md:grid-cols-3 xl:gap-6">
        {COLUMNAS.map((columna) => {
          const items = itemsPorColumna[columna.estado] ?? [];
          return (
            <section key={columna.estado} className="flex min-w-0 flex-col rounded-3xl border border-border bg-surface/50 p-3 sm:p-4">
              <header className="flex items-center justify-between gap-2 px-1 pb-3">
                <h2 className="flex items-center gap-2.5 text-sm font-semibold">
                  <span className={cx("size-2.5 rounded-full", columna.barra)} aria-hidden />
                  {columna.titulo}
                </h2>
                <Insignia tono={columna.tono} className="tabular-nums">
                  {items.length}
                </Insignia>
              </header>
              <div className="grid gap-3">
                {items.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-8 text-xs text-muted-foreground">
                    <ChefHat className="size-4" aria-hidden /> Nada por aquí
                  </p>
                ) : null}
                {items.map((item) => {
                  const atrasado = estaAtrasado(item, item.pedido.creadoEn, ahora);
                  return (
                    <article
                      key={item.id}
                      data-resaltado={estaResaltado(item)}
                      className={cx(
                        "relative animate-emerger overflow-hidden rounded-2xl border bg-surface p-4 text-sm shadow-suave transition-colors duration-300",
                        atrasado ? "border-peligro/70 bg-peligro/[0.08] ring-1 ring-peligro/40" : "border-border",
                        estaResaltado(item) && CLASE_RESALTADO,
                      )}
                    >
                      <span className={cx("absolute inset-y-0 left-0 w-1", atrasado ? "bg-peligro" : columna.barra)} aria-hidden />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-semibold tracking-tight">
                          {item.pedido.mesaSesion ? `Mesa ${item.pedido.mesaSesion.mesa?.numero}` : etiquetaCanal(item.pedido)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                          <Clock className="size-3.5" aria-hidden />~{item.tiempoPreparacionMinutos} min
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.pedido.mesaSesion
                          ? `Mesero: ${nombreCompleto(item.pedido.mesaSesion.mesero) || "—"}`
                          : `Cliente: ${item.pedido.nombreCliente ?? "—"}`}
                      </p>
                      <p className="mt-3 text-base leading-snug font-semibold">
                        <span className="tabular-nums">{item.cantidad}×</span> {item.producto?.nombre}
                        <span className="font-normal text-muted-foreground">
                          {item.paraLlevar ? " — Para llevar" : item.comensal ? ` — ${item.comensal.nombre}` : " — Para compartir"}
                        </span>
                      </p>
                      {item.adiciones && item.adiciones.length > 0 ? (
                        <p className="mt-1 text-sm font-semibold text-accent">+ {item.adiciones.map((a) => a.nombre).join(", ")}</p>
                      ) : null}
                      {item.comboNombre ? <p className="mt-1 text-xs text-muted-foreground">{etiquetaCombo(item)}</p> : null}
                      {item.paraLlevar || item.notas ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {item.paraLlevar ? (
                            <Insignia tono="info" className="tracking-wide uppercase">
                              <ShoppingBag aria-hidden /> Empacar para llevar
                            </Insignia>
                          ) : null}
                          {item.notas ? (
                            <Insignia tono="aviso">
                              <StickyNote aria-hidden /> {item.notas}
                            </Insignia>
                          ) : null}
                        </div>
                      ) : null}

                      {atrasado ? (
                        <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-peligro">
                          <AlertTriangle className="mt-px size-4 shrink-0 animate-pulse" aria-hidden />
                          Se pasó del tiempo — ¿va atrasado o ya salió y falta marcarlo?
                        </p>
                      ) : null}

                      {columna.estado === "RECIBIDO" ? (
                        <Boton bloque className="mt-4" onClick={() => avanzarItem(item, "EN_PREPARACION")} disabled={updatingItemId === item.id}>
                          Empezar a preparar
                        </Boton>
                      ) : columna.estado === "EN_PREPARACION" ? (
                        <Boton bloque variante="exito" className="mt-4" onClick={() => avanzarItem(item, "LISTO")} disabled={updatingItemId === item.id}>
                          Ya salió
                        </Boton>
                      ) : (
                        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-exito/10 py-2 text-xs font-semibold text-exito">
                          <PuntoVivo tono="exito" /> Esperando al mesero…
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Contenedor>
  );
}
