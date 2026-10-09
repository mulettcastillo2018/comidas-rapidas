"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { playForTipo, unlockAudio } from "@/lib/notificationSound";
import { useAuthStore } from "@/store/auth.store";
import { cx } from "@/components/ui";
import { useClicFuera } from "@/lib/useClicFuera";
import type { Notificacion, UserRole } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  PEDIDO_NUEVO: "Pedido nuevo",
  ITEM_RETRASADO: "Retraso",
  ITEM_LISTO: "Listo para entregar",
  SOLICITUD_PEDIDO_CLIENTE: "Pedido del cliente",
  ITEM_CANCELADO: "Producto cancelado",
  AUTORIZACION: "Autorización",
  STOCK: "Inventario",
  LLAMADO_MESA: "Te llaman",
  OPINION: "Opinión de un cliente",
  FACTURACION: "Facturación electrónica",
};

// A dónde lleva el clic. Las notificaciones nuevas traen el destino exacto
// (la mesa, el pedido...); las anteriores a esa mejora van al módulo según
// su tipo.
function destino(n: Notificacion, rol: UserRole): string {
  if (n.enlace) return n.enlace;
  switch (n.tipo) {
    case "PEDIDO_NUEVO":
    case "ITEM_RETRASADO":
    case "ITEM_CANCELADO":
      return n.pedidoId ? `/cocina?pedido=${n.pedidoId}` : "/cocina";
    case "SOLICITUD_PEDIDO_CLIENTE":
      return rol === "ADMIN" && n.mensaje.startsWith("Pedido de mostrador") ? "/admin/mostrador" : "/mesero";
    case "STOCK":
      return rol === "ADMIN" ? "/admin/inventario" : "/cocina";
    case "AUTORIZACION":
    case "OPINION":
      return "/admin/reportes";
    case "FACTURACION":
      return "/admin/facturacion";
    default:
      return "/mesero";
  }
}

export function NotificationBell() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  const contenedorRef = useClicFuera<HTMLDivElement>(abierto, cerrar);

  useEffect(() => {
    if (!token || !user) return;
    const cargarNotificaciones = () => apiFetch<Notificacion[]>("/notificaciones", { token }).then(setNotificaciones);
    cargarNotificaciones();

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // por si llegaron notificaciones mientras tanto.
    const dejarDeEscuchar = suscribirEnVivo(token, {
      connect: cargarNotificaciones,
      "notificacion:nueva": (n: Notificacion) => {
        setNotificaciones((prev) => [n, ...prev].slice(0, 50));
        playForTipo(n.tipo);
      },
    });

    const desbloquear = () => unlockAudio();
    window.addEventListener("click", desbloquear, { once: true });
    window.addEventListener("keydown", desbloquear, { once: true });

    return () => {
      dejarDeEscuchar();
      window.removeEventListener("click", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  if (!user) return null;

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  async function marcarTodasLeidas() {
    if (!token) return;
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    await apiFetch("/notificaciones/leer-todas", { method: "PUT", token });
  }

  async function marcarLeida(n: Notificacion) {
    if (!token || n.leida) return;
    setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    await apiFetch(`/notificaciones/${n.id}/leida`, { method: "PUT", token });
  }

  function abrir(n: Notificacion) {
    setAbierto(false);
    marcarLeida(n).catch(() => {});
    router.push(destino(n, user!.role));
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : "Notificaciones"}
        className={cx(
          "relative grid size-9 place-items-center rounded-full transition-colors duration-200 hover:bg-surface-2 hover:text-foreground",
          abierto ? "bg-surface-2 text-foreground" : "text-muted-foreground",
        )}
        title="Notificaciones"
      >
        <Bell className="size-[18px]" />
        {noLeidas > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 animate-emerger items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-background tabular-nums">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        ) : null}
      </button>
      {abierto ? (
        <div className="fixed inset-x-3 top-[4.25rem] z-50 flex max-h-[min(28rem,calc(100dvh-6rem))] origin-top-right animate-emerger flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-flotante sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-3 sm:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">
              Notificaciones
              {noLeidas > 0 ? <span className="ml-2 text-xs font-medium text-muted-foreground tabular-nums">{noLeidas} sin leer</span> : null}
            </p>
            {noLeidas > 0 ? (
              <button
                onClick={marcarTodasLeidas}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent transition-colors duration-200 hover:bg-accent/10"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Marcar todas leídas
              </button>
            ) : null}
          </div>
          {notificaciones.length === 0 ? (
            <div className="grid place-items-center gap-2 px-4 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted-foreground">
                <Bell className="size-4" aria-hidden />
              </span>
              <p className="text-xs text-muted-foreground">Sin notificaciones todavía.</p>
            </div>
          ) : (
            <ul className="overflow-y-auto overscroll-contain p-1.5">
              {notificaciones.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => abrir(n)}
                    title="Ir a donde está"
                    className={cx(
                      "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors duration-200 hover:bg-surface-2",
                      n.leida ? "" : "bg-accent/[0.06]",
                    )}
                  >
                    <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-accent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-accent">{TIPO_LABEL[n.tipo] ?? n.tipo}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {new Date(n.creadaEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="mt-0.5 block leading-relaxed text-foreground">{n.mensaje}</span>
                    </span>
                    <ChevronRight
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-resorte group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
