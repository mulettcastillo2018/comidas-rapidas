"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { reemplazarPedidoActivo } from "@/lib/pedidos";
import { nombreCompleto, nombreCorto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import type { Pedido } from "@/lib/types";

function minutosTranscurridos(pedido: Pedido, ahora: number): number {
  return Math.max(0, Math.round((ahora - new Date(pedido.creadoEn).getTime()) / 60000));
}

export default function PantallaPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    cargarPedidos();

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con datos viejos en pantalla.
    return suscribirEnVivo(token, {
      connect: cargarPedidos,
      "pedido:nuevo": (pedido: Pedido) => setPedidos((prev) => [...prev.filter((p) => p.id !== pedido.id), pedido]),
      "pedido:actualizado": (pedido: Pedido) => setPedidos((prev) => reemplazarPedidoActivo(prev, pedido)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const tarjetas = useMemo(() => {
    return [...pedidos]
      .sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime())
      .map((pedido) => {
        const items = pedido.items.filter((i) => i.estado !== "CANCELADO" && i.estado !== "ENTREGADO");
        const listos = items.filter((i) => i.estado === "LISTO").length;
        const todoListo = items.length > 0 && listos === items.length;
        return { pedido, items, listos, todoListo };
      })
      .filter((t) => t.items.length > 0);
  }, [pedidos]);

  if (!user || (user.role !== "PANTALLA" && user.role !== "ADMIN")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">Esta sección es solo para la pantalla del local.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-center text-3xl font-extrabold">Estado de pedidos</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Se actualiza solo, no necesitas refrescar.</p>

      {tarjetas.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">No hay pedidos activos en este momento.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tarjetas.map(({ pedido, items, listos, todoListo }) => (
            <div
              key={pedido.id}
              className={`rounded-2xl border-2 p-5 transition-colors ${todoListo ? "border-accent bg-accent/10" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-3xl font-extrabold">
                  {pedido.mesaSesion ? `Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}` : "🧾 Mostrador"}
                </p>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                  {pedido.origenCliente ? "📱 Pedido por QR" : "🧑‍🍳 Tomado por mesero"}
                </span>
              </div>
              <p className="mt-1 font-semibold">{nombreCorto(pedido.mesaSesion?.nombreResponsable ?? pedido.nombreCliente) || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {pedido.mesaSesion ? `Mesero: ${nombreCompleto(pedido.mesaSesion.mesero) || "—"}` : "Atendido en caja"} · hace{" "}
                {minutosTranscurridos(pedido, ahora)} min
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {items.map((i) => `${i.cantidad}× ${i.producto?.nombre}`).join(", ")}
              </p>
              <p className={`mt-3 text-lg font-bold ${todoListo ? "text-accent" : "text-muted-foreground"}`}>
                {todoListo ? "¡Listo para recoger!" : `${listos}/${items.length} listos`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
