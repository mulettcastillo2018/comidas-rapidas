"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ordenarMesas } from "@/lib/mesas";
import type { Mesa, MesaSesion } from "@/lib/types";

// Cambios a una mesa ya abierta: llega alguien más, o el grupo se pasa a
// otra mesa. Solo mientras no se haya generado la cuenta.
export function GestionMesa({
  sesion,
  token,
  usuarioId,
  esAdmin,
  onActualizada,
}: {
  sesion: MesaSesion;
  token: string;
  usuarioId: string;
  esAdmin: boolean;
  onActualizada: (sesion: MesaSesion, aviso: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [mesasLibres, setMesasLibres] = useState<Mesa[] | null>(null);
  const [destinoId, setDestinoId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comensales = sesion.comensales?.length ?? 0;
  const capacidad = sesion.mesa?.capacidad ?? 0;

  async function agregarComensal(event: FormEvent) {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return;
    // Igual que al abrir la mesa: superar el aforo requiere confirmar la silla.
    const necesitaSilla = comensales + 1 > capacidad + sesion.sillasAdicionales;
    if (necesitaSilla && !confirm(`La Mesa ${sesion.mesa?.numero} es para ${capacidad} y ya está llena. ¿Vas a traer una silla adicional?`)) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await apiFetch<MesaSesion>(`/mesa-sesiones/${sesion.id}/comensales`, {
        method: "POST",
        token,
        body: JSON.stringify({ nombre: limpio, confirmaSillaExtra: necesitaSilla }),
      });
      setNombre("");
      onActualizada(actualizada, `${limpio} se sumó a la mesa`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el comensal.");
    } finally {
      setGuardando(false);
    }
  }

  async function abrirCambioDeMesa() {
    setError(null);
    const mesas = await apiFetch<Mesa[]>("/mesas", { token });
    setMesasLibres(
      ordenarMesas(
        mesas.filter((m) => m.estado === "LIBRE" && (!m.meseroAsignadoId || m.meseroAsignadoId === sesion.meseroId || m.meseroAsignadoId === usuarioId || esAdmin))
      )
    );
    setDestinoId("");
  }

  async function mover() {
    const destino = mesasLibres?.find((m) => m.id === destinoId);
    if (!destino) return;
    const sillas = Math.max(0, comensales - destino.capacidad);
    const pregunta =
      sillas > 0
        ? `La Mesa ${destino.numero} es para ${destino.capacidad} y son ${comensales}. ¿Llevan ${sillas} silla(s) adicional(es)?`
        : `¿Pasar a todo el grupo, con sus pedidos, a la Mesa ${destino.numero}?`;
    if (!confirm(pregunta)) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await apiFetch<MesaSesion>(`/mesa-sesiones/${sesion.id}/mover`, {
        method: "PUT",
        token,
        body: JSON.stringify({ mesaId: destino.id, confirmaSillaExtra: sillas > 0 }),
      });
      setMesasLibres(null);
      onActualizada(actualizada, `Mesa cambiada a la ${destino.numero}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar de mesa.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-border p-4 text-sm">
      <form onSubmit={agregarComensal} className="flex flex-wrap items-center gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Llegó alguien más: su nombre"
          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5"
        />
        <button type="submit" disabled={guardando || !nombre.trim()} className="rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50">
          + Agregar comensal
        </button>
      </form>

      {mesasLibres === null ? (
        <button onClick={abrirCambioDeMesa} className="text-xs font-semibold text-accent">
          Cambiar de mesa…
        </button>
      ) : mesasLibres.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay mesas libres ahora.{" "}
          <button onClick={() => setMesasLibres(null)} className="font-semibold text-accent">
            Cerrar
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className="rounded-lg border border-border px-2 py-1.5">
            <option value="">Pasar a la mesa…</option>
            {mesasLibres.map((m) => (
              <option key={m.id} value={m.id}>
                Mesa {m.numero} ({m.capacidad} puestos)
              </option>
            ))}
          </select>
          <button onClick={mover} disabled={!destinoId || guardando} className="btn-primary rounded-full px-3 py-1.5 text-xs disabled:opacity-50">
            Cambiar
          </button>
          <button onClick={() => setMesasLibres(null)} className="text-xs text-muted-foreground">
            Cancelar
          </button>
        </div>
      )}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
