"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { playForTipo, unlockAudio } from "@/lib/notificationSound";
import { useAuthStore } from "@/store/auth.store";
import type { Notificacion, UserRole } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  PEDIDO_NUEVO: "Pedido nuevo",
  ITEM_RETRASADO: "Retraso",
  ITEM_LISTO: "Listo para entregar",
  SOLICITUD_PEDIDO_CLIENTE: "Pedido del cliente",
  ITEM_CANCELADO: "Producto cancelado",
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
  const contenedorRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        className="relative rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        title="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        ) : null}
      </button>
      {abierto ? (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border p-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            {noLeidas > 0 ? (
              <button onClick={marcarTodasLeidas} className="text-xs font-semibold text-accent">
                Marcar todas leídas
              </button>
            ) : null}
          </div>
          {notificaciones.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Sin notificaciones todavía.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notificaciones.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => abrir(n)}
                    title="Ir a donde está"
                    className={`flex w-full items-center gap-2 p-3 text-left text-xs hover:bg-muted ${n.leida ? "" : "bg-accent/5"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-accent">{TIPO_LABEL[n.tipo] ?? n.tipo}</span>
                      <span className="mt-0.5 block text-foreground">{n.mensaje}</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {new Date(n.creadaEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
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
