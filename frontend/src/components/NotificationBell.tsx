"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import { playForTipo, unlockAudio } from "@/lib/notificationSound";
import { useAuthStore } from "@/store/auth.store";
import type { Notificacion } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  PEDIDO_NUEVO: "Pedido nuevo",
  ITEM_RETRASADO: "Retraso",
  ITEM_LISTO: "Listo para entregar",
  SOLICITUD_PEDIDO_CLIENTE: "Pedido del cliente",
  ITEM_CANCELADO: "Producto cancelado",
};

export function NotificationBell() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !user) return;
    const cargarNotificaciones = () => apiFetch<Notificacion[]>("/notificaciones", { token }).then(setNotificaciones);
    cargarNotificaciones();

    const socket = createSocket(token);
    // Si el socket se desconecta (reinicio del servidor, wifi, etc.) podemos
    // perdernos notificaciones mientras tanto; al reconectar sincronizamos
    // de nuevo contra la API.
    socket.on("connect", cargarNotificaciones);
    socket.on("notificacion:nueva", (n: Notificacion) => {
      setNotificaciones((prev) => [n, ...prev].slice(0, 50));
      playForTipo(n.tipo);
    });

    const desbloquear = () => unlockAudio();
    window.addEventListener("click", desbloquear, { once: true });
    window.addEventListener("keydown", desbloquear, { once: true });

    return () => {
      socket.disconnect();
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
                    onClick={() => marcarLeida(n)}
                    className={`block w-full p-3 text-left text-xs hover:bg-muted ${n.leida ? "" : "bg-accent/5"}`}
                  >
                    <p className="font-semibold text-accent">{TIPO_LABEL[n.tipo] ?? n.tipo}</p>
                    <p className="mt-0.5 text-foreground">{n.mensaje}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.creadaEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
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
