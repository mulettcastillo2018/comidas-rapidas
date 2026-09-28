"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { Plataforma } from "@/lib/types";

// Apps de domicilios con las que trabaja el negocio y cuánto cobra cada una.
export function PlataformasAdmin({
  token,
  plataformas,
  onCambio,
}: {
  token: string;
  plataformas: Plataforma[];
  onCambio: (lista: Plataforma[]) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [comision, setComision] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function guardar(cambio: Promise<Plataforma>) {
    setError(null);
    try {
      const guardada = await cambio;
      const existe = plataformas.some((p) => p.id === guardada.id);
      onCambio(existe ? plataformas.map((p) => (p.id === guardada.id ? guardada : p)) : [...plataformas, guardada]);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
      return false;
    }
  }

  async function agregar(event: FormEvent) {
    event.preventDefault();
    const pct = Number(comision.replace(",", "."));
    const ok = await guardar(
      apiFetch<Plataforma>("/plataformas", { method: "POST", token, body: JSON.stringify({ nombre: nombre.trim(), comisionPct: pct }) })
    );
    if (ok) {
      setNombre("");
      setComision("");
    }
  }

  function editarComision(p: Plataforma) {
    const nueva = prompt(`Nueva comisión de ${p.nombre} (%):`, String(p.comisionPct));
    if (nueva === null) return;
    guardar(apiFetch<Plataforma>(`/plataformas/${p.id}`, { method: "PUT", token, body: JSON.stringify({ comisionPct: Number(nueva.replace(",", ".")) }) }));
  }

  return (
    <div className="space-y-3">
      {plataformas.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {plataformas.map((p) => (
            <li key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 ${p.activa ? "" : "opacity-50"}`}>
              <span>
                <strong>{p.nombre}</strong> · comisión {p.comisionPct}%
              </span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => editarComision(p)} className="font-semibold text-accent">
                  Cambiar comisión
                </button>
                <button
                  onClick={() => guardar(apiFetch<Plataforma>(`/plataformas/${p.id}`, { method: "PUT", token, body: JSON.stringify({ activa: !p.activa }) }))}
                  className="text-muted-foreground"
                >
                  {p.activa ? "Desactivar" : "Activar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no has agregado ninguna app.</p>
      )}
      <form onSubmit={agregar} className="flex flex-wrap items-center gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. Rappi)" className="rounded-lg border border-border px-3 py-1.5 text-sm" />
        <input
          value={comision}
          onChange={(e) => setComision(e.target.value)}
          placeholder="Comisión %"
          inputMode="decimal"
          className="w-28 rounded-lg border border-border px-3 py-1.5 text-sm"
        />
        <button disabled={!nombre.trim() || !comision} className="rounded-full border border-accent px-4 py-1.5 text-sm font-semibold text-accent disabled:opacity-50">
          + Agregar app
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
