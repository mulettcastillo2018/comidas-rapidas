"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { etiquetaCanal, reemplazarPedidoActivo } from "@/lib/pedidos";
import { nombreCompleto, nombreCorto } from "@/lib/nombre";
import { conAdiciones } from "@/lib/items";
import { useAuthStore } from "@/store/auth.store";
import { ConciergeBell, PartyPopper, Smartphone, UtensilsCrossed } from "lucide-react";
import { Contenedor, cx, Insignia, PuntoVivo } from "@/components/ui";
import type { Pedido } from "@/lib/types";

type Tarjeta = { pedido: Pedido; items: Pedido["items"]; listos: number; todoListo: boolean };

// Una tarjeta por pedido: número grande para leerlo desde lejos y avance de la cocina.
function TarjetaPedido({ tarjeta, ahora, posicion }: { tarjeta: Tarjeta; ahora: number; posicion: number }) {
  const { pedido, items, listos, todoListo } = tarjeta;
  const avance = items.length ? Math.round((listos / items.length) * 100) : 0;
  return (
    <article
      style={{ animationDelay: `${Math.min(posicion, 10) * 40}ms` }}
      className={cx(
        "relative flex animate-emerger flex-col overflow-hidden rounded-3xl border p-6 transition-colors duration-500",
        todoListo ? "border-exito/50 bg-exito/[0.08] shadow-[0_0_48px_-12px] shadow-exito/40" : "border-border bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {pedido.mesaSesion ? `Mesa ${pedido.mesaSesion.mesa?.numero ?? "?"}` : etiquetaCanal(pedido)}
        </p>
        <Insignia className="shrink-0 tracking-wide uppercase">
          {pedido.origenCliente ? <Smartphone aria-hidden /> : <ConciergeBell aria-hidden />}
          {pedido.origenCliente ? "Pedido por QR" : "Tomado por mesero"}
        </Insignia>
      </div>
      <p className="mt-2 text-lg font-semibold">{nombreCorto(pedido.mesaSesion?.nombreResponsable ?? pedido.nombreCliente) || "—"}</p>
      <p className="text-sm text-muted-foreground">
        {pedido.mesaSesion ? `Mesero: ${nombreCompleto(pedido.mesaSesion.mesero) || "—"}` : "Atendido en caja"} · hace{" "}
        <span className="tabular-nums">{minutosTranscurridos(pedido, ahora)}</span> min
      </p>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{items.map((i) => `${i.cantidad}× ${conAdiciones(i, i.producto?.nombre)}`).join(", ")}</p>
      <div className="mt-auto pt-5">
        {todoListo ? (
          <p className="flex items-center gap-2 text-2xl font-semibold text-exito">
            <PartyPopper className="size-6" aria-hidden /> ¡Listo para recoger!
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-foreground tabular-nums">{`${listos}/${items.length} listos`}</span>
              <span className="text-muted-foreground tabular-nums">{avance}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-linear-to-r from-accent to-accent-2 transition-[width] duration-700 ease-salida" style={{ width: `${Math.max(avance, 4)}%` }} />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

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
  // Lo listo va primero: es lo que el cliente busca en la pantalla.
  const listosParaRecoger = tarjetas.filter((t) => t.todoListo);
  const enPreparacion = tarjetas.filter((t) => !t.todoListo);

  if (!user || (user.role !== "PANTALLA" && user.role !== "ADMIN")) {
    return (
      <Contenedor ancho="medio" className="text-center">
        <p className="text-muted-foreground">Esta sección es solo para la pantalla del local.</p>
      </Contenedor>
    );
  }

  return (
    <Contenedor ancho="total">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Estado de pedidos</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">Se actualiza solo, no necesitas refrescar.</p>
        </div>
        <div className="flex items-center gap-3">
          <Insignia tono="exito" className="px-3 py-1">
            <PuntoVivo tono="exito" /> En vivo
          </Insignia>
          <span className="text-3xl font-semibold text-muted-foreground tabular-nums">
            {new Date(ahora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </header>

      {tarjetas.length === 0 ? (
        <div className="mt-16 grid place-items-center gap-4 rounded-3xl border border-dashed border-border py-24 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-muted-foreground">
            <UtensilsCrossed className="size-7" aria-hidden />
          </span>
          <p className="text-lg text-muted-foreground">No hay pedidos activos en este momento.</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-10">
          {listosParaRecoger.length ? (
            <section aria-label="Listos para recoger">
              <h2 className="mb-4 flex items-center gap-2.5 text-sm font-semibold tracking-[0.14em] text-exito uppercase">
                <PuntoVivo tono="exito" /> Listos para recoger
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {listosParaRecoger.map((tarjeta, i) => (
                  <TarjetaPedido key={tarjeta.pedido.id} tarjeta={tarjeta} ahora={ahora} posicion={i} />
                ))}
              </div>
            </section>
          ) : null}
          {enPreparacion.length ? (
            <section aria-label="En preparación">
              <h2 className="mb-4 text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">En preparación</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {enPreparacion.map((tarjeta, i) => (
                  <TarjetaPedido key={tarjeta.pedido.id} tarjeta={tarjeta} ahora={ahora} posicion={i} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Contenedor>
  );
}
