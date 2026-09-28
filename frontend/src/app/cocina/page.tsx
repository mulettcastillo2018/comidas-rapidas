"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { PanelDisponibilidad } from "@/components/cocina/PanelDisponibilidad";
import type { Pedido, PedidoItem, Producto } from "@/lib/types";

const COLUMNAS = [
  { estado: "RECIBIDO" as const, titulo: "Recibido" },
  { estado: "EN_PREPARACION" as const, titulo: "En preparación" },
  { estado: "LISTO" as const, titulo: "Listo — falta despachar" },
];

interface ItemConContexto extends PedidoItem {
  pedido: Pedido;
}

// El "reloj" de un producto arranca cuando cocina lo empieza a preparar; si
// todavía no lo ha empezado, se cuenta desde que llegó el pedido — en ambos
// casos, pasarse del tiempo configurado es la señal de alerta (o se demoró
// de verdad, o salió y nadie lo marcó en el sistema).
function minutosTranscurridos(item: ItemConContexto, ahora: number): number {
  const referencia = item.iniciadoEn ? new Date(item.iniciadoEn) : new Date(item.pedido.creadoEn);
  return (ahora - referencia.getTime()) / 60000;
}

function estaAtrasado(item: ItemConContexto, ahora: number): boolean {
  return minutosTranscurridos(item, ahora) > item.tiempoPreparacionMinutos;
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

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    const cargarProductos = () => apiFetch<Producto[]>("/productos", { token }).then(setProductos);
    cargarPedidos();
    cargarProductos();

    const socket = createSocket(token);
    // Si el socket se desconecta (reinicio del servidor, wifi, etc.) podemos
    // perdernos eventos mientras tanto; al reconectar volvemos a sincronizar
    // contra la API en vez de quedarnos con pedidos viejos en pantalla.
    socket.on("connect", () => {
      cargarPedidos();
      cargarProductos();
    });
    socket.on("pedido:nuevo", (pedido: Pedido) => {
      setPedidos((prev) => [...prev.filter((p) => p.id !== pedido.id), pedido]);
      // Un pedido de solo bebidas no le toca a cocina: no se anuncia.
      if (!pedido.items.some((i) => i.estado === "RECIBIDO")) return;
      showToast(
        pedido.mesaSesion ? `Nuevo pedido — Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}` : `Nuevo pedido — Mostrador (${pedido.nombreCliente ?? "cliente"})`
      );
    });
    socket.on("producto:actualizado", (producto: Producto) => {
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? producto : p)));
    });
    socket.on("pedido:actualizado", (pedido: Pedido) => {
      setPedidos((prev) => {
        if (pedido.estado === "ENTREGADO" || pedido.estado === "CANCELADO") {
          return prev.filter((p) => p.id !== pedido.id);
        }
        return prev.map((p) => (p.id === pedido.id ? pedido : p));
      });
    });

    return () => {
      socket.disconnect();
    };
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
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">Esta sección es solo para cocina.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Tablero de cocina</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada producto se despacha por separado. Si algo se demora más de lo esperado, se marca en rojo — revisa si de
        verdad va atrasado o si ya salió y falta confirmarlo aquí.
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <PanelDisponibilidad
        productos={productos}
        cambiando={cambiandoProductoId}
        onCambiar={cambiarDisponibilidad}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {COLUMNAS.map((columna) => (
          <div key={columna.estado} className="rounded-xl border border-border p-3">
            <h2 className="text-sm font-bold">
              {columna.titulo} <span className="text-muted-foreground">({itemsPorColumna[columna.estado]?.length ?? 0})</span>
            </h2>
            <div className="mt-3 space-y-3">
              {itemsPorColumna[columna.estado]?.map((item) => {
                const atrasado = columna.estado !== "LISTO" && estaAtrasado(item, ahora);
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 text-sm ${
                      atrasado ? "animate-pulse border-2 border-red-600 bg-red-50" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {item.pedido.mesaSesion ? `Mesa ${item.pedido.mesaSesion.mesa?.numero}` : "🧾 Mostrador"}
                      </span>
                      <span className="text-xs text-muted-foreground">~{item.tiempoPreparacionMinutos} min</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.pedido.mesaSesion
                        ? `Mesero: ${nombreCompleto(item.pedido.mesaSesion.mesero) || "—"}`
                        : `Cliente: ${item.pedido.nombreCliente ?? "—"}`}
                    </p>
                    <p className="mt-1 font-semibold">
                      {item.cantidad}× {item.producto?.nombre}
                      {item.paraLlevar ? " — 🥡 Para llevar" : item.comensal ? ` — ${item.comensal.nombre}` : " — Para compartir"}
                    </p>
                    {item.paraLlevar ? (
                      <p className="text-[10px] font-bold uppercase tracking-wide text-accent">Empacar para llevar</p>
                    ) : null}
                    {item.notas ? <p className="text-xs text-muted-foreground">{item.notas}</p> : null}

                    {atrasado ? (
                      <p className="mt-2 flex items-center gap-1 text-xs font-bold text-red-700">
                        <AlertTriangle size={14} />
                        Se pasó del tiempo — ¿va atrasado o ya salió y falta marcarlo?
                      </p>
                    ) : null}

                    {columna.estado === "RECIBIDO" ? (
                      <button
                        onClick={() => avanzarItem(item, "EN_PREPARACION")}
                        disabled={updatingItemId === item.id}
                        className="btn-primary mt-3 w-full rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Empezar a preparar
                      </button>
                    ) : columna.estado === "EN_PREPARACION" ? (
                      <button
                        onClick={() => avanzarItem(item, "LISTO")}
                        disabled={updatingItemId === item.id}
                        className="btn-primary mt-3 w-full rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ya salió
                      </button>
                    ) : (
                      <p className="mt-3 text-center text-xs font-semibold text-accent">Esperando al mesero…</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
