"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos, hoyLocal } from "@/lib/formato";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { SelectorRango } from "@/components/reportes/SelectorRango";
import { formatoHoras, type Configuracion, type ListaTurnos, type RepartoPropinas, type Turno } from "@/lib/gestion";

const ROL: Record<string, string> = { ADMIN: "Admin", MESERO: "Mesero", COCINA: "Cocina" };

// "2026-09-28T14:30" en hora de Colombia, para un <input type="datetime-local">.
function aCampoLocal(iso: string | null): string {
  if (!iso) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

const desdeCampoLocal = (valor: string) => (valor ? new Date(`${valor}:00-05:00`).toISOString() : null);

function EditorTurno({ turno, token, onGuardado }: { turno: Turno; token: string; onGuardado: () => void }) {
  const [entrada, setEntrada] = useState(aCampoLocal(turno.entrada));
  const [salida, setSalida] = useState(aCampoLocal(turno.salida));
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    try {
      await apiFetch(`/turnos/${turno.id}`, { method: "PUT", token, body: JSON.stringify({ entrada: desdeCampoLocal(entrada), salida: desdeCampoLocal(salida) }) });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo corregir el turno.");
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <input type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="rounded border border-border px-1 py-0.5" />
      <span>a</span>
      <input type="datetime-local" value={salida} onChange={(e) => setSalida(e.target.value)} className="rounded border border-border px-1 py-0.5" />
      <button onClick={guardar} className="font-semibold text-accent">
        Guardar
      </button>
      {error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}

export default function AdminPersonalPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(hoyLocal(-6));
  const [hasta, setHasta] = useState(hoy);
  const [turnos, setTurnos] = useState<ListaTurnos | null>(null);
  const [reparto, setReparto] = useState<RepartoPropinas | null>(null);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!token) return;
    setError(null);
    Promise.all([
      apiFetch<ListaTurnos>(`/turnos?desde=${desde}&hasta=${hasta}`, { token }).then(setTurnos),
      apiFetch<RepartoPropinas>(`/reportes/propinas?desde=${desde}&hasta=${hasta}`, { token }).then(setReparto),
    ]).catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la información del personal."));
  }, [token, desde, hasta]);

  useEffect(cargar, [cargar]);
  useEffect(() => {
    if (token) apiFetch<Configuracion>("/configuracion", { token }).then(setConfig);
  }, [token]);

  async function guardarConfig(cambio: Partial<Configuracion>) {
    if (!token || !config) return;
    try {
      const nueva = await apiFetch<Configuracion>("/configuracion", { method: "PUT", token, body: JSON.stringify({ ...config, ...cambio }) });
      setConfig(nueva);
      showToast("Reparto de propinas actualizado");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración.");
    }
  }

  if (!token) return null;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Cada persona marca su entrada y su salida con el botón del reloj (arriba). Con esas horas se reparten las propinas.
      </p>
      <SelectorRango
        desde={desde}
        hasta={hasta}
        onCambio={(d, h) => {
          setDesde(d);
          setHasta(h);
        }}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Reparto de propinas</h2>
        {config ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <label className="flex items-center gap-2">
              Para cocina:
              <select
                value={config.propinaPctCocina}
                onChange={(e) => guardarConfig({ propinaPctCocina: Number(e.target.value) })}
                className="rounded-lg border border-border px-2 py-1"
              >
                {[0, 10, 15, 20, 25, 30, 40, 50].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Salón:
              <select
                value={config.propinaModo}
                onChange={(e) => guardarConfig({ propinaModo: e.target.value as Configuracion["propinaModo"] })}
                className="rounded-lg border border-border px-2 py-1"
              >
                <option value="PROPIAS">cada mesero lo de sus mesas</option>
                <option value="POZO">todo junto, por horas trabajadas</option>
              </select>
            </label>
          </div>
        ) : null}
        {reparto ? (
          reparto.total === 0 ? (
            <p className="text-sm text-muted-foreground">No hubo propinas en estas fechas.</p>
          ) : (
            <>
              <p className="text-sm">
                Propinas: <strong>{formatoPesos(reparto.total)}</strong>
                {reparto.paraCocina > 0 ? ` · cocina ${formatoPesos(reparto.paraCocina)} · salón ${formatoPesos(reparto.paraSalon)}` : ""}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4">Persona</th>
                      <th className="py-1.5 pr-4">Horas</th>
                      <th className="py-1.5 pr-4 text-right">Propinas de sus mesas</th>
                      <th className="py-1.5 text-right">Le corresponde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reparto.reparto.map((p) => (
                      <tr key={p.userId} className="border-b border-border/60">
                        <td className="py-1.5 pr-4">
                          {p.nombre} <span className="text-[11px] text-muted-foreground">{ROL[p.role] ?? p.role}</span>
                        </td>
                        <td className="py-1.5 pr-4">{formatoHoras(p.horas)}</td>
                        <td className="py-1.5 pr-4 text-right text-muted-foreground">{p.propiasGeneradas > 0 ? formatoPesos(p.propiasGeneradas) : "—"}</td>
                        <td className="py-1.5 text-right font-semibold">{formatoPesos(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reparto.avisos.map((a) => (
                <p key={a} className="text-xs text-amber-700">
                  {a}
                </p>
              ))}
            </>
          )
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Horas trabajadas</h2>
        {!turnos ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : turnos.turnos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie ha marcado turnos en estas fechas.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {turnos.porPersona.map((p) => (
                <span key={p.userId} className="rounded-full bg-muted px-3 py-1 text-xs">
                  <strong>{p.nombre}</strong> {formatoHoras(p.horas)} ({p.turnos} turno{p.turnos === 1 ? "" : "s"})
                </span>
              ))}
            </div>
            <ul className="space-y-1.5 text-sm">
              {turnos.turnos.map((t) => (
                <li key={t.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{t.nombre}</strong> · {formatoFechaHora(t.entrada)} → {t.salida ? formatoFechaHora(t.salida) : <span className="text-green-700">sigue en turno</span>}
                      {t.editado ? <span className="ml-1 text-[11px] text-muted-foreground">(corregido)</span> : null}
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="font-semibold">{formatoHoras(t.horas)}</span>
                      <button onClick={() => setEditandoId(editandoId === t.id ? null : t.id)} className="text-accent">
                        {editandoId === t.id ? "Cerrar" : "Corregir"}
                      </button>
                    </span>
                  </div>
                  {editandoId === t.id ? (
                    <EditorTurno
                      turno={t}
                      token={token}
                      onGuardado={() => {
                        setEditandoId(null);
                        showToast("Turno corregido");
                        cargar();
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
