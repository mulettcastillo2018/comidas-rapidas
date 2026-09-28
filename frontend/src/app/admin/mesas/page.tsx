"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { ordenarMesas, aplicarCambioDeMesa } from "@/lib/mesas";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa, MesaSesion, UserRole } from "@/lib/types";

interface UsuarioBasico {
  id: string;
  nombre: string;
  apellido: string;
  role: UserRole;
  isActive: boolean;
}

export default function AdminMesasPage() {
  const token = useAuthStore((state) => state.token);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [meseros, setMeseros] = useState<UsuarioBasico[]>([]);
  const [sesionesActivas, setSesionesActivas] = useState<MesaSesion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reasignandoId, setReasignandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function loadData() {
    if (!token) return;
    const [mesasData, usuariosData, sesionesData] = await Promise.all([
      apiFetch<Mesa[]>("/mesas?incluirInactivas=true", { token }),
      apiFetch<UsuarioBasico[]>("/usuarios", { token }),
      apiFetch<MesaSesion[]>("/mesa-sesiones?activas=true", { token }),
    ]);
    setMesas(ordenarMesas(mesasData));
    setMeseros(usuariosData.filter((u) => u.role === "MESERO" && u.isActive));
    setSesionesActivas(sesionesData);
  }

  function sesionDeMesa(mesaId: string) {
    return sesionesActivas.find((s) => s.mesaId === mesaId);
  }

  async function handleReasignar(sesionId: string, meseroId: string) {
    if (!token || !meseroId) return;
    setError(null);
    setReasignandoId(sesionId);
    try {
      await apiFetch(`/mesa-sesiones/${sesionId}/reasignar`, { method: "PUT", token, body: JSON.stringify({ meseroId }) });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reasignar la mesa.");
    } finally {
      setReasignandoId(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadData();

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con el estado viejo de las mesas.
    return suscribirEnVivo(token, {
      connect: loadData,
      "mesa:actualizada": (mesa: Mesa) => setMesas((prev) => aplicarCambioDeMesa(prev, mesa, true)),
      "mesaSesion:nueva": (sesion: MesaSesion) => {
        setMesas((prev) => prev.map((m) => (m.id === sesion.mesaId ? { ...m, estado: "OCUPADA" } : m)));
        setSesionesActivas((prev) => [...prev.filter((s) => s.id !== sesion.id), sesion]);
      },
      "mesaSesion:cerrada": (payload: { mesaId: string; sesionId: string }) => {
        setMesas((prev) => prev.map((m) => (m.id === payload.mesaId ? { ...m, estado: "LIBRE" } : m)));
        setSesionesActivas((prev) => prev.filter((s) => s.id !== payload.sesionId));
      },
    });
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

  async function handleDelete(mesa: Mesa) {
    if (!token) return;
    if (
      !confirm(
        `¿Quitar la Mesa ${mesa.numero}?\n\nSi ya tuvo clientes (pedidos o cuentas), no se borra: se desactiva para no perder ese historial, y la puedes reactivar cuando quieras.`
      )
    )
      return;
    setError(null);
    setAviso(null);
    try {
      const respuesta = await apiFetch<{ eliminada: boolean }>(`/mesas/${mesa.id}`, { method: "DELETE", token });
      setAviso(
        respuesta.eliminada
          ? `Mesa ${mesa.numero} eliminada.`
          : `Mesa ${mesa.numero} desactivada: ya no aparece para los meseros ni en el QR, pero su historial se conserva.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar la mesa.");
    }
  }

  async function handleReactivar(mesa: Mesa) {
    if (!token) return;
    setError(null);
    setAviso(null);
    try {
      await apiFetch(`/mesas/${mesa.id}`, { method: "PUT", token, body: JSON.stringify({ activa: true }) });
      setAviso(`Mesa ${mesa.numero} reactivada.`);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reactivar la mesa.");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cada mesa debe estar identificada aquí para que el mesero pueda abrirla al recibir clientes. Puedes asignarla a
        un mesero específico (solo él o el admin podrán atenderla) o dejarla libre para cualquiera.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {aviso ? <p className="text-sm text-green-700">{aviso}</p> : null}

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
          ) : !mesa.activa ? (
            <div
              key={mesa.id}
              className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border p-3 text-center opacity-60"
            >
              <p className="text-lg font-bold">Mesa {mesa.numero}</p>
              <p className="text-xs text-muted-foreground">{mesa.capacidad} puestos</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Desactivada</span>
              <button onClick={() => handleReactivar(mesa)} className="mt-1 text-xs font-semibold text-accent">
                Reactivar
              </button>
            </div>
          ) : (
            <div key={mesa.id} className="relative flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-center">
              {mesa.estado === "OCUPADA" ? (
                <span className="absolute right-2 top-2 flex items-center gap-1" title="Mesa ocupada ahora mismo">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">En vivo</span>
                </span>
              ) : null}
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
                    {nombreCompleto(m)}
                  </option>
                ))}
              </select>
              {mesa.estado === "OCUPADA" && sesionDeMesa(mesa.id) ? (
                <div className="mt-1 w-full">
                  <p className="text-[11px] text-muted-foreground">Atendida por {nombreCompleto(sesionDeMesa(mesa.id)?.mesero)}</p>
                  <select
                    defaultValue=""
                    disabled={reasignandoId === sesionDeMesa(mesa.id)?.id}
                    onChange={(e) => {
                      const sesionId = sesionDeMesa(mesa.id)?.id;
                      if (sesionId && e.target.value) handleReasignar(sesionId, e.target.value);
                      e.target.value = "";
                    }}
                    className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-[11px]"
                  >
                    <option value="">Reasignar a otro mesero…</option>
                    {meseros
                      .filter((m) => m.id !== sesionDeMesa(mesa.id)?.meseroId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {nombreCompleto(m)}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              <div className="mt-1 flex gap-3">
                <button onClick={() => setEditingId(mesa.id)} className="text-xs font-semibold text-accent">
                  Editar
                </button>
                {mesa.estado === "LIBRE" ? (
                  <button onClick={() => handleDelete(mesa)} className="text-xs font-semibold text-red-600">
                    Quitar
                  </button>
                ) : null}
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
