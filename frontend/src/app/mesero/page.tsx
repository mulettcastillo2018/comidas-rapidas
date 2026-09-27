"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa, MesaSesion } from "@/lib/types";

export default function MeseroPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [sesionesActivas, setSesionesActivas] = useState<MesaSesion[]>([]);
  const [openingMesa, setOpeningMesa] = useState<Mesa | null>(null);
  const [comensalInputs, setComensalInputs] = useState<string[]>(["", ""]);
  const [confirmaSillaExtra, setConfirmaSillaExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    const [mesasData, sesionesData] = await Promise.all([
      apiFetch<Mesa[]>("/mesas", { token }),
      apiFetch<MesaSesion[]>("/mesa-sesiones?activas=true", { token }),
    ]);
    setMesas(mesasData);
    setSesionesActivas(sesionesData);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function sesionDeMesa(mesaId: string) {
    return sesionesActivas.find((s) => s.mesaId === mesaId);
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
    const form = event.currentTarget;
    const nombreResponsable = (form.elements.namedItem("nombreResponsable") as HTMLInputElement).value;
    const comensales = comensalInputs.map((c) => c.trim()).filter(Boolean);

    if (comensales.length === 0) {
      setError("Registra al menos un comensal.");
      return;
    }
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
              <input
                name="nombreResponsable"
                placeholder="¿A nombre de quién queda la mesa?"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Comensales</p>
                {comensalInputs.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={value}
                      onChange={(e) =>
                        setComensalInputs((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                      }
                      placeholder={`Nombre comensal ${index + 1}${index >= mesa.capacidad ? " (silla adicional)" : ""}`}
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
              disabled={mesa.estado === "LIBRE" && asignadaAOtroMesero(mesa)}
              onClick={() => (mesa.estado === "LIBRE" ? startOpening(mesa) : sesion && router.push(`/mesero/mesa/${sesion.id}`))}
              className={`flex flex-col items-center gap-1 rounded-xl border p-4 text-center transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                mesa.estado === "LIBRE" ? "border-border hover:border-accent" : "border-accent bg-accent/5"
              }`}
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
                    ? `Asignada a ${mesa.meseroAsignado?.name}`
                    : "Libre — abrir"
                  : sesion?.nombreResponsable ?? "Ocupada"}
              </span>
              {mesa.estado === "OCUPADA" && sesion && sesion.meseroId !== user?.id ? (
                <span className="text-[11px] text-muted-foreground">Atendida por {sesion.mesero?.name}</span>
              ) : null}
              {mesa.estado === "OCUPADA" && sesion && sesion.sillasAdicionales > 0 ? (
                <span className="text-[11px] font-semibold text-accent">+{sesion.sillasAdicionales} silla(s) extra</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
