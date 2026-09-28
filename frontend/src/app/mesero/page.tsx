"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { ordenarMesas, aplicarCambioDeMesa } from "@/lib/mesas";
import { CLASE_RESALTADO, useResaltado } from "@/lib/resaltado";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa, MesaSesion, Pedido, SolicitudPedido } from "@/lib/types";

export default function MeseroPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [sesionesActivas, setSesionesActivas] = useState<MesaSesion[]>([]);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<SolicitudPedido[]>([]);
  const [openingMesa, setOpeningMesa] = useState<Mesa | null>(null);
  const [comensalInputs, setComensalInputs] = useState<string[]>(["", ""]);
  const [confirmaSillaExtra, setConfirmaSillaExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Al llegar desde la notificación de un pedido QR en una mesa sin abrir.
  const [resaltado, lectorResaltado] = useResaltado(["mesa"]);
  // Mesas donde el cliente tocó "Llamar al mesero" o "Pedir la cuenta" desde
  // el QR. Se quita al entrar a la mesa o a los 5 minutos.
  const [llamados, setLlamados] = useState<Record<string, { tipo: "MESERO" | "CUENTA"; en: number }>>({});
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);

  async function loadData() {
    if (!token) return;
    const [mesasData, sesionesData, solicitudesData] = await Promise.all([
      apiFetch<Mesa[]>("/mesas", { token }),
      apiFetch<MesaSesion[]>("/mesa-sesiones?activas=true", { token }),
      apiFetch<SolicitudPedido[]>("/solicitudes?estado=PENDIENTE", { token }),
    ]);
    setMesas(ordenarMesas(mesasData));
    setSesionesActivas(sesionesData);
    setSolicitudesPendientes(solicitudesData);
  }

  useEffect(() => {
    if (!token) return;
    loadData();

    // Para que la grilla muestre al instante qué mesas tienen algo listo para
    // entregar, sin que el mesero tenga que entrar mesa por mesa a revisar.
    const actualizarPedidoEnSesiones = (pedido: Pedido) => {
      setSesionesActivas((prev) =>
        prev.map((s) =>
          s.id === pedido.mesaSesionId
            ? { ...s, pedidos: [...(s.pedidos?.filter((p) => p.id !== pedido.id) ?? []), pedido] }
            : s
        )
      );
    };

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con mesas/solicitudes viejas.
    return suscribirEnVivo(token, {
      connect: loadData,
      "mesa:actualizada": (mesa: Mesa) => setMesas((prev) => aplicarCambioDeMesa(prev, mesa, false)),
      "mesaSesion:nueva": (sesion: MesaSesion) => {
        setSesionesActivas((prev) => [...prev.filter((s) => s.id !== sesion.id), sesion]);
        setMesas((prev) => prev.map((m) => (m.id === sesion.mesaId ? { ...m, estado: "OCUPADA" } : m)));
      },
      "mesaSesion:cerrada": (payload: { mesaId: string; sesionId: string }) => {
        setSesionesActivas((prev) => prev.filter((s) => s.id !== payload.sesionId));
        setMesas((prev) => prev.map((m) => (m.id === payload.mesaId ? { ...m, estado: "LIBRE" } : m)));
      },
      "solicitud:nueva": (solicitud: SolicitudPedido) =>
        setSolicitudesPendientes((prev) => [...prev.filter((s) => s.id !== solicitud.id), solicitud]),
      "solicitud:actualizada": (solicitud: SolicitudPedido) =>
        setSolicitudesPendientes((prev) => prev.filter((s) => s.id !== solicitud.id)),
      "pedido:nuevo": actualizarPedidoEnSesiones,
      "pedido:actualizado": actualizarPedidoEnSesiones,
      "mesa:llamado": (llamado: { mesaId: string; tipo: "MESERO" | "CUENTA" }) =>
        setLlamados((prev) => ({ ...prev, [llamado.mesaId]: { tipo: llamado.tipo, en: Date.now() } })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function sesionDeMesa(mesaId: string) {
    return sesionesActivas.find((s) => s.mesaId === mesaId);
  }

  function solicitudesDeMesa(mesaId: string) {
    return solicitudesPendientes.filter((s) => s.mesaId === mesaId).length;
  }

  // Cuenta los productos ya listos en cocina que todavía no se han entregado,
  // para que la grilla lo muestre sin tener que entrar a cada mesa a revisar.
  function productosListosEnMesa(mesaId: string) {
    const sesion = sesionDeMesa(mesaId);
    if (!sesion?.pedidos) return 0;
    return sesion.pedidos.reduce((total, pedido) => total + pedido.items.filter((i) => i.estado === "LISTO").length, 0);
  }

  function asignadaAOtroMesero(mesa: Mesa) {
    return Boolean(mesa.meseroAsignadoId) && mesa.meseroAsignadoId !== user?.id && user?.role !== "ADMIN";
  }

  function startOpening(mesa: Mesa) {
    setOpeningMesa(mesa);
    setComensalInputs(Array(Math.max(1, mesa.capacidad)).fill(""));
    setConfirmaSillaExtra(false);
    setError(null);
  }

  const seSuperaCapacidad = Boolean(openingMesa) && comensalInputs.length > openingMesa!.capacidad;
  const sillasExtra = openingMesa ? Math.max(0, comensalInputs.length - openingMesa.capacidad) : 0;

  async function handleAbrirMesa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !openingMesa) return;
    const comensales = comensalInputs.map((c) => c.trim()).filter(Boolean);

    if (comensales.length === 0) {
      setError("Registra al menos un comensal, empezando por quién queda a cargo de la mesa.");
      return;
    }
    // El primer comensal es quien queda a cargo de la mesa (para la cuenta) —
    // así no se escribe dos veces ni se queda por fuera del conteo de aforo.
    const nombreResponsable = comensales[0];
    if (seSuperaCapacidad && !confirmaSillaExtra) {
      setError("Confirma que traerás una silla adicional para superar la capacidad de la mesa.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const sesion = await apiFetch<MesaSesion>("/mesa-sesiones", {
        method: "POST",
        token,
        body: JSON.stringify({ mesaId: openingMesa.id, nombreResponsable, comensales, confirmaSillaExtra }),
      });
      router.push(`/mesero/mesa/${sesion.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la mesa.");
    } finally {
      setSaving(false);
    }
  }

  if (!user || (user.role !== "MESERO" && user.role !== "ADMIN")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">Esta sección es solo para meseros.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Mesas</h1>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {lectorResaltado}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {mesas.map((mesa) => {
          const sesion = sesionDeMesa(mesa.id);
          return openingMesa?.id === mesa.id ? (
            <form
              key={mesa.id}
              onSubmit={handleAbrirMesa}
              className="col-span-2 space-y-2 rounded-xl border border-accent p-4 sm:col-span-3 md:col-span-4"
            >
              <p className="font-semibold">
                Abrir Mesa {mesa.numero} <span className="font-normal text-muted-foreground">({mesa.capacidad} puestos)</span>
              </p>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  Comensales (el primero queda a cargo de la mesa, para la cuenta)
                </p>
                {comensalInputs.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={value}
                      onChange={(e) =>
                        setComensalInputs((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                      }
                      placeholder={
                        index === 0
                          ? "Nombre — a cargo de la mesa"
                          : `Nombre comensal ${index + 1}${index >= mesa.capacidad ? " (silla adicional)" : ""}`
                      }
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                        index >= mesa.capacidad ? "border-accent bg-accent/5" : "border-border"
                      }`}
                    />
                    {comensalInputs.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setComensalInputs((prev) => prev.filter((_, i) => i !== index))}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setComensalInputs((prev) => [...prev, ""])}
                  className="flex items-center gap-1 text-xs font-semibold text-accent"
                >
                  <Plus size={14} /> Agregar comensal
                </button>
              </div>

              {seSuperaCapacidad ? (
                <label className="flex items-start gap-2 rounded-lg bg-accent/10 p-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmaSillaExtra}
                    onChange={(e) => setConfirmaSillaExtra(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Esta mesa es para {mesa.capacidad} personas. Confirmo que traeré {sillasExtra} silla(s) adicional(es)
                    de otra mesa o de bodega.
                  </span>
                </label>
              ) : null}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || (seSuperaCapacidad && !confirmaSillaExtra)}
                  className="btn-primary flex-1 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Abriendo…" : "Abrir mesa"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpeningMesa(null)}
                  className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              key={mesa.id}
              data-resaltado={resaltado.mesa === mesa.id}
              disabled={mesa.estado === "LIBRE" && asignadaAOtroMesero(mesa)}
              onClick={() => {
                setLlamados(({ [mesa.id]: _atendido, ...resto }) => resto);
                if (mesa.estado === "LIBRE") startOpening(mesa);
                else if (sesion) router.push(`/mesero/mesa/${sesion.id}`);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border p-4 text-center transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                mesa.estado === "LIBRE" ? "border-border hover:border-accent" : "border-accent bg-accent/5"
              } ${resaltado.mesa === mesa.id ? CLASE_RESALTADO : ""}`}
            >
              <p className="text-lg font-bold">Mesa {mesa.numero}</p>
              <p className="text-xs text-muted-foreground">{mesa.capacidad} puestos</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  mesa.estado === "LIBRE" ? "bg-muted text-muted-foreground" : "bg-accent text-white"
                }`}
              >
                {mesa.estado === "LIBRE"
                  ? asignadaAOtroMesero(mesa)
                    ? `Asignada a ${nombreCompleto(mesa.meseroAsignado)}`
                    : "Libre — abrir"
                  : sesion?.nombreResponsable ?? "Ocupada"}
              </span>
              {mesa.estado === "OCUPADA" && sesion && sesion.meseroId !== user?.id ? (
                <span className="text-[11px] text-muted-foreground">Atendida por {nombreCompleto(sesion.mesero)}</span>
              ) : null}
              {mesa.estado === "OCUPADA" && sesion && sesion.sillasAdicionales > 0 ? (
                <span className="text-[11px] font-semibold text-accent">+{sesion.sillasAdicionales} silla(s) extra</span>
              ) : null}
              {productosListosEnMesa(mesa.id) > 0 ? (
                <span className="animate-pulse rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  ✅ {productosListosEnMesa(mesa.id)} listo{productosListosEnMesa(mesa.id) > 1 ? "s" : ""} para entregar
                </span>
              ) : null}
              {solicitudesDeMesa(mesa.id) > 0 ? (
                <span className="animate-pulse rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
                  🔔 Pedido del cliente esperando
                </span>
              ) : null}
              {llamados[mesa.id] && ahora - llamados[mesa.id].en < 5 * 60_000 ? (
                <span className="animate-pulse rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {llamados[mesa.id].tipo === "CUENTA" ? "🧾 Pide la cuenta" : "🙋 Te están llamando"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
