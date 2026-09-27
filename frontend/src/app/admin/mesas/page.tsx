"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa, UserRole } from "@/lib/types";

interface UsuarioBasico {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export default function AdminMesasPage() {
  const token = useAuthStore((state) => state.token);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [meseros, setMeseros] = useState<UsuarioBasico[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    const [mesasData, usuariosData] = await Promise.all([
      apiFetch<Mesa[]>("/mesas", { token }),
      apiFetch<UsuarioBasico[]>("/usuarios", { token }),
    ]);
    setMesas(mesasData);
    setMeseros(usuariosData.filter((u) => u.role === "MESERO" && u.isActive));
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function readForm(form: HTMLFormElement) {
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    return { numero: field("numero"), capacidad: Number(field("capacidad") || 1) };
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/mesas", { method: "POST", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setCreating(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/mesas/${id}`, { method: "PUT", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAsignarMesero(mesaId: string, meseroAsignadoId: string) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(`/mesas/${mesaId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ meseroAsignadoId: meseroAsignadoId === "" ? null : meseroAsignadoId }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo asignar el mesero.");
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm("¿Eliminar esta mesa?")) return;
    try {
      await apiFetch(`/mesas/${id}`, { method: "DELETE", token });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la mesa.");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cada mesa debe estar identificada aquí para que el mesero pueda abrirla al recibir clientes. Puedes asignarla a
        un mesero específico (solo él o el admin podrán atenderla) o dejarla libre para cualquiera.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {mesas.map((mesa) =>
          editingId === mesa.id ? (
            <form
              key={mesa.id}
              onSubmit={(e) => handleUpdate(mesa.id, e)}
              className="flex flex-col gap-1.5 rounded-xl border border-border p-3"
            >
              <input name="numero" defaultValue={mesa.numero} required className="w-full rounded-lg border border-border px-2 py-1 text-sm" />
              <input
                name="capacidad"
                type="number"
                min={1}
                defaultValue={mesa.capacidad}
                required
                className="w-full rounded-lg border border-border px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-full px-3 py-1 text-sm">
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex-1 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div key={mesa.id} className="flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">Mesa {mesa.numero}</p>
              <p className="text-xs text-muted-foreground">{mesa.capacidad} puestos</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  mesa.estado === "LIBRE" ? "bg-muted text-muted-foreground" : "bg-accent/10 text-accent"
                }`}
              >
                {mesa.estado === "LIBRE" ? "Libre" : "Ocupada"}
              </span>
              <select
                value={mesa.meseroAsignadoId ?? ""}
                onChange={(e) => handleAsignarMesero(mesa.id, e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-xs"
              >
                <option value="">Sin asignar (libre)</option>
                {meseros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 flex gap-3">
                <button onClick={() => setEditingId(mesa.id)} className="text-xs font-semibold text-accent">
                  Editar
                </button>
                <button onClick={() => handleDelete(mesa.id)} className="text-xs font-semibold text-red-600">
                  Eliminar
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <input name="numero" placeholder="Número de mesa" required className="rounded-lg border border-border px-2 py-1 text-sm" />
          <input name="capacidad" type="number" min={1} placeholder="Capacidad" required className="w-28 rounded-lg border border-border px-2 py-1 text-sm" />
          <button type="submit" disabled={saving} className="btn-primary rounded-full px-4 py-1 text-sm">
            {saving ? "Guardando…" : "Crear"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground">
            Cancelar
          </button>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className="btn-primary rounded-full px-4 py-2 text-sm">
          + Nueva mesa
        </button>
      )}
    </div>
  );
}
