"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import type { Pedido, PedidoItem } from "@/lib/types";

interface ItemConContexto extends PedidoItem {
  pedido: Pedido;
}

const ITEM_ESTADO_LABELS: Record<string, string> = {
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo",
  CANCELADO: "Cancelado",
};

// Mismo criterio de atraso que usa /cocina: el reloj arranca cuando empezó a
// prepararse o, si aún no ha empezado, desde que llegó el pedido.
function minutosTranscurridos(item: ItemConContexto, ahora: number): number {
  const referencia = item.iniciadoEn ? new Date(item.iniciadoEn) : new Date(item.pedido.creadoEn);
  return (ahora - referencia.getTime()) / 60000;
}

function estaAtrasado(item: ItemConContexto, ahora: number): boolean {
  return item.estado !== "LISTO" && minutosTranscurridos(item, ahora) > item.tiempoPreparacionMinutos;
}

export default function AdminPedidosPage() {
  const token = useAuthStore((state) => state.token);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    cargarPedidos();

    const socket = createSocket(token);
    // Si el socket se desconecta (reinicio del servidor, wifi, etc.) podemos
    // perdernos eventos mientras tanto; al reconectar volvemos a sincronizar
    // contra la API en vez de quedarnos con pedidos viejos en pantalla.
    socket.on("connect", cargarPedidos);
    socket.on("pedido:nuevo", (pedido: Pedido) => {
      setPedidos((prev) => [...prev, pedido]);
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

  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const porMesa = useMemo(() => {
    // Cada pedido de mostrador es su propia tarjeta (clave = su id) porque no
    // hay mesa que los agrupe — si usáramos "?" para todos, se mezclarían
    // los pedidos de distintos clientes de mostrador entre sí.
    const grupos = new Map<string, { titulo: string; items: ItemConContexto[] }>();
    for (const pedido of pedidos) {
      const clave = pedido.mesaSesion ? `Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}` : `mostrador-${pedido.id}`;
      const titulo = pedido.mesaSesion
        ? `Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}`
        : `🧾 Mostrador — ${pedido.nombreCliente ?? "cliente"}`;
      for (const item of pedido.items) {
        if (item.estado === "CANCELADO" || item.estado === "ENTREGADO") continue;
        if (!grupos.has(clave)) grupos.set(clave, { titulo, items: [] });
        grupos.get(clave)!.items.push({ ...item, pedido });
      }
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [pedidos]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Solo lectura: todo lo que está activo ahora mismo en cocina, agrupado por mesa. Se actualiza sola, no hace
        falta refrescar.
      </p>

      {porMesa.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos activos en este momento.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {porMesa.map(([clave, { titulo, items }]) => (
            <div key={clave} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{titulo}</h2>
                <span className="text-xs text-muted-foreground">
                  {items[0]?.pedido.mesaSesion
                    ? `Mesero: ${nombreCompleto(items[0].pedido.mesaSesion.mesero) || "—"}`
                    : "Atendido en caja"}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((item) => {
                  const atrasado = estaAtrasado(item, ahora);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-2 text-sm ${atrasado ? "border-2 border-red-600 bg-red-50" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {item.cantidad}× {item.producto?.nombre}
                          {item.pedido.origenCliente ? (
                            <span className="ml-1 text-[10px] italic text-muted-foreground">(pedido por QR)</span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ITEM_ESTADO_LABELS[item.estado] ?? item.estado}
                        </span>
                      </div>
                      {item.paraLlevar ? (
                        <p className="text-xs font-bold text-accent">🥡 Para llevar</p>
                      ) : item.comensal ? (
                        <p className="text-xs text-muted-foreground">Para: {item.comensal.nombre}</p>
                      ) : null}
                      {item.notas ? <p className="text-xs text-muted-foreground">{item.notas}</p> : null}
                      {atrasado ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-700">
                          <AlertTriangle size={12} /> Atrasado
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
