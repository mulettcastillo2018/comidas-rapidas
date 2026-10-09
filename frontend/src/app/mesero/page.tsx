"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Hand, Plus, Receipt, Users, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { ordenarMesas, aplicarCambioDeMesa } from "@/lib/mesas";
import { CLASE_RESALTADO, useResaltado } from "@/lib/resaltado";
import { useAuthStore } from "@/store/auth.store";
import { Boton, Contenedor, cx, EncabezadoPagina, Entrada, Esqueleto, Insignia, PuntoVivo } from "@/components/ui";
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
  // Mientras llega la primera carga se muestran marcadores, no una grilla vacía.
  const [cargando, setCargando] = useState(true);
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
    setCargando(false);
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
      <Contenedor ancho="medio" className="text-center">
        <p className="text-muted-foreground">Esta sección es solo para meseros.</p>
      </Contenedor>
    );
  }

  const ocupadas = mesas.filter((m) => m.estado === "OCUPADA").length;

  return (
    <Contenedor>
      <EncabezadoPagina
        antetitulo="Servicio en sala"
        titulo="Mesas"
        descripcion={
          mesas.length ? (
            <span className="tabular-nums">
              {ocupadas} ocupada{ocupadas === 1 ? "" : "s"} · {mesas.length - ocupadas} libre{mesas.length - ocupadas === 1 ? "" : "s"}
            </span>
          ) : null
        }
      />
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm font-medium text-peligro ring-1 ring-peligro/20 ring-inset">
          {error}
        </p>
      ) : null}
      {lectorResaltado}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {cargando && mesas.length === 0
          ? Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="h-36 rounded-2xl" />)
          : null}
        {mesas.map((mesa, posicion) => {
          const sesion = sesionDeMesa(mesa.id);
          const listos = productosListosEnMesa(mesa.id);
          const libre = mesa.estado === "LIBRE";
          const deOtro = libre && asignadaAOtroMesero(mesa);
          const llamado = llamados[mesa.id] && ahora - llamados[mesa.id].en < 5 * 60_000 ? llamados[mesa.id] : null;
          return openingMesa?.id === mesa.id ? (
            <form
              key={mesa.id}
              onSubmit={handleAbrirMesa}
              className="col-span-full grid animate-emerger gap-5 rounded-3xl border border-accent/40 bg-surface p-5 shadow-elevada ring-4 ring-accent/10 sm:p-7"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold tracking-tight">
                  Abrir Mesa {mesa.numero} <span className="text-sm font-normal text-muted-foreground">({mesa.capacidad} puestos)</span>
                </p>
                <p className="text-xs text-muted-foreground">Comensales (el primero queda a cargo de la mesa, para la cuenta)</p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {comensalInputs.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span
                      className={cx(
                        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                        index === 0 ? "bg-accent text-accent-foreground" : index >= mesa.capacidad ? "bg-aviso/15 text-aviso" : "bg-surface-2 text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <Entrada
                      value={value}
                      onChange={(e) => setComensalInputs((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))}
                      placeholder={
                        index === 0 ? "Nombre — a cargo de la mesa" : `Nombre comensal ${index + 1}${index >= mesa.capacidad ? " (silla adicional)" : ""}`
                      }
                      aria-label={index === 0 ? "Comensal a cargo de la mesa" : `Comensal ${index + 1}`}
                      className={cx("flex-1", index >= mesa.capacidad && "border-aviso/50 bg-aviso/5")}
                    />
                    {comensalInputs.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setComensalInputs((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={`Quitar comensal ${index + 1}`}
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-peligro/10 hover:text-peligro"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Boton type="button" variante="fantasma" tamano="sm" className="w-fit text-accent hover:text-accent" onClick={() => setComensalInputs((prev) => [...prev, ""])}>
                <Plus /> Agregar comensal
              </Boton>

              {seSuperaCapacidad ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-aviso/10 p-4 text-sm text-foreground ring-1 ring-aviso/25 ring-inset">
                  <input
                    type="checkbox"
                    checked={confirmaSillaExtra}
                    onChange={(e) => setConfirmaSillaExtra(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span>
                    Esta mesa es para {mesa.capacidad} personas. Confirmo que traeré {sillasExtra} silla(s) adicional(es) de otra mesa o de bodega.
                  </span>
                </label>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Boton type="button" variante="secundario" onClick={() => setOpeningMesa(null)}>
                  Cancelar
                </Boton>
                <Boton type="submit" cargando={saving} disabled={seSuperaCapacidad && !confirmaSillaExtra} className="sm:min-w-40">
                  {saving ? "Abriendo…" : "Abrir mesa"}
                </Boton>
              </div>
            </form>
          ) : (
            <button
              key={mesa.id}
              data-resaltado={resaltado.mesa === mesa.id}
              disabled={deOtro}
              style={{ animationDelay: `${Math.min(posicion, 12) * 30}ms` }}
              onClick={() => {
                setLlamados(({ [mesa.id]: _atendido, ...resto }) => resto);
                if (mesa.estado === "LIBRE") startOpening(mesa);
                else if (sesion) router.push(`/mesero/mesa/${sesion.id}`);
              }}
              className={cx(
                "group relative flex min-h-36 animate-aparecer flex-col items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left shadow-suave transition-[transform,box-shadow,border-color] duration-300 ease-salida sm:p-5",
                "hover:-translate-y-0.5 hover:shadow-elevada active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-suave",
                libre ? "border-border bg-surface hover:border-border-strong" : "border-accent/35 bg-accent/[0.04] hover:border-accent/60",
                resaltado.mesa === mesa.id && CLASE_RESALTADO,
              )}
            >
              {libre ? null : <span className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-accent to-accent-2" aria-hidden />}
              <div className="flex w-full items-start justify-between gap-2">
                <p className="text-lg font-semibold tracking-tight">Mesa {mesa.numero}</p>
                <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title={`${mesa.capacidad} puestos`}>
                  <Users className="size-3.5" aria-hidden />
                  {mesa.capacidad}
                  <span className="sr-only"> puestos</span>
                </span>
              </div>

              <div className="grid justify-items-start gap-1.5">
                <Insignia tono={libre ? "neutro" : "acento"} className="max-w-full">
                  <span className="truncate">
                    {libre ? (deOtro ? `Asignada a ${nombreCompleto(mesa.meseroAsignado)}` : "Libre — abrir") : sesion?.nombreResponsable ?? "Ocupada"}
                  </span>
                </Insignia>
                {mesa.estado === "OCUPADA" && sesion && sesion.meseroId !== user?.id ? (
                  <span className="text-xs text-muted-foreground">Atendida por {nombreCompleto(sesion.mesero)}</span>
                ) : null}
                {mesa.estado === "OCUPADA" && sesion && sesion.sillasAdicionales > 0 ? (
                  <span className="text-xs font-semibold text-aviso">+{sesion.sillasAdicionales} silla(s) extra</span>
                ) : null}
              </div>

              {listos > 0 || solicitudesDeMesa(mesa.id) > 0 || llamado ? (
                <div className="mt-auto grid w-full gap-1.5">
                  {listos > 0 ? (
                    <Insignia tono="exito" className="w-full justify-start">
                      <PuntoVivo tono="exito" />
                      {listos} listo{listos > 1 ? "s" : ""} para entregar
                    </Insignia>
                  ) : null}
                  {solicitudesDeMesa(mesa.id) > 0 ? (
                    <Insignia tono="acento" className="w-full justify-start">
                      <BellRing className="animate-pulse" aria-hidden />
                      Pedido del cliente esperando
                    </Insignia>
                  ) : null}
                  {llamado ? (
                    <Insignia tono="aviso" className="w-full justify-start">
                      {llamado.tipo === "CUENTA" ? <Receipt className="animate-pulse" aria-hidden /> : <Hand className="animate-pulse" aria-hidden />}
                      {llamado.tipo === "CUENTA" ? "Pide la cuenta" : "Te están llamando"}
                    </Insignia>
                  ) : null}
                </div>
              ) : libre && !deOtro ? (
                <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Plus className="size-3.5" aria-hidden /> Abrir mesa
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Contenedor>
  );
}
