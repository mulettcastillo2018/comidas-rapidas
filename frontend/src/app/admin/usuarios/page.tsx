"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { MiClaveSupervisor } from "@/components/admin/MiClaveSupervisor";
import { activas, useSedes } from "@/lib/sedes";
import type { UserRole } from "@/lib/types";

interface AdminUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  tienePin: boolean;
  // null = administrador general.
  sedeId: string | null;
  sede: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MESERO: "Mesero",
  COCINA: "Cocina",
  PANTALLA: "Pantalla",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date(iso));
}

export default function AdminUsuariosPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const sedes = useSedes();
  const listaSedes = activas(sedes);
  // Con una sola sede no hace falta elegir: todos trabajan en ella.
  const eligeSede = Boolean(sedes?.puedeCambiar) && listaSedes.length > 1;
  const [rolNuevo, setRolNuevo] = useState<UserRole>("MESERO");
  // null = la sede en la que se está; "GENERAL" = administrador general.
  const [sedeNueva, setSedeNueva] = useState<string | null>(null);

  async function loadUsuarios() {
    if (!token) return;
    const data = await apiFetch<AdminUser[]>("/usuarios", { token });
    setUsuarios(data);
  }

  useEffect(() => {
    loadUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    try {
      await apiFetch("/usuarios", {
        method: "POST",
        token,
        body: JSON.stringify({
          nombre: field("nombre"),
          apellido: field("apellido"),
          email: field("email"),
          password: field("password"),
          role: field("role"),
          ...(eligeSede ? { sedeId: sedeNueva === "GENERAL" ? (rolNuevo === "ADMIN" ? null : sedes!.actual) : (sedeNueva ?? sedes!.actual) } : {}),
        }),
      });
      form.reset();
      setCreating(false);
      await loadUsuarios();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeRole(user: AdminUser, role: UserRole) {
    if (!token || role === user.role) return;
    if (!confirm(`¿Cambiar el rol de ${user.email} a "${ROLE_LABELS[role]}"?`)) return;
    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/usuarios/${user.id}/role`, { method: "PUT", token, body: JSON.stringify({ role }) });
      await loadUsuarios();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el rol.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleChangeSede(user: AdminUser, sedeId: string) {
    if (!token || sedeId === (user.sedeId ?? "")) return;
    const destino = sedeId ? listaSedes.find((s) => s.id === sedeId)?.nombre : "todas las sedes (administrador general)";
    if (!confirm(`¿Pasar a ${nombreCompleto(user)} a ${destino}? Se cerrará su sesión para que entre ya en su nueva sede.`)) return;
    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/usuarios/${user.id}/sede`, { method: "PUT", token, body: JSON.stringify({ sedeId: sedeId || null }) });
      await loadUsuarios();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la sede.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    if (!token) return;
    const nextActive = !user.isActive;
    const confirmMessage = nextActive
      ? `¿Reactivar la cuenta de ${user.email}?`
      : `¿Desactivar la cuenta de ${user.email}? No podrá iniciar sesión.`;
    if (!confirm(confirmMessage)) return;
    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/usuarios/${user.id}/active`, { method: "PUT", token, body: JSON.stringify({ isActive: nextActive }) });
      await loadUsuarios();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado de la cuenta.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleEditName(userId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;

    setNameError(null);
    setUpdatingId(userId);
    try {
      await apiFetch(`/usuarios/${userId}/nombre`, {
        method: "PUT",
        token,
        body: JSON.stringify({ nombre: field("nombre"), apellido: field("apellido") }),
      });
      setEditingNameId(null);
      await loadUsuarios();
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "No se pudo actualizar el nombre.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResetPassword(userId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const newPassword = field("newPassword");
    const confirmPassword = field("confirmPassword");

    if (newPassword !== confirmPassword) {
      setResetError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setResetError(null);
    setUpdatingId(userId);
    try {
      await apiFetch(`/usuarios/${userId}/password`, { method: "PUT", token, body: JSON.stringify({ newPassword }) });
      setResettingId(null);
      showToast("Contraseña restablecida");
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setUpdatingId(null);
    }
  }

  const yo = usuarios.find((u) => u.id === currentUser?.id);

  return (
    <div className="space-y-6">
      {token && yo ? <MiClaveSupervisor token={token} tienePin={yo.tienePin} onCambio={loadUsuarios} /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {usuarios.map((user) => (
          <div key={user.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {nombreCompleto(user)} {!user.isActive ? <span className="text-red-600">(desactivado)</span> : null}
                  {user.role === "ADMIN" && user.tienePin ? (
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">con clave de supervisor</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {user.email} · Desde {formatDate(user.createdAt)}
                  {listaSedes.length > 1 ? ` · ${user.sede ?? "Todas las sedes"}` : null}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setNameError(null);
                    setEditingNameId(editingNameId === user.id ? null : user.id);
                  }}
                  className="text-sm font-semibold text-accent"
                >
                  Editar nombre
                </button>
                <button
                  onClick={() => {
                    setResetError(null);
                    setResettingId(resettingId === user.id ? null : user.id);
                  }}
                  className="text-sm font-semibold text-accent"
                >
                  Restablecer contraseña
                </button>
                {user.id === currentUser?.id ? (
                  <span className="text-xs text-muted-foreground">(tú)</span>
                ) : (
                  <>
                    {eligeSede ? (
                      <select
                        value={user.sedeId ?? ""}
                        onChange={(e) => handleChangeSede(user, e.target.value)}
                        disabled={updatingId === user.id}
                        title="Sede donde trabaja"
                        className="rounded-lg border border-border px-2 py-1 text-sm"
                      >
                        {listaSedes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                        {user.role === "ADMIN" ? <option value="">Todas (general)</option> : null}
                      </select>
                    ) : null}
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user, e.target.value as UserRole)}
                      disabled={updatingId === user.id}
                      className="rounded-lg border border-border px-2 py-1 text-sm"
                    >
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={updatingId === user.id}
                      className="text-sm font-semibold text-red-600 disabled:opacity-50"
                    >
                      {user.isActive ? "Desactivar" : "Reactivar"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {editingNameId === user.id ? (
              <form
                onSubmit={(e) => handleEditName(user.id, e)}
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
              >
                {nameError ? <p className="w-full text-sm text-red-600">{nameError}</p> : null}
                <input name="nombre" placeholder="Nombre" defaultValue={user.nombre} required className="rounded-lg border border-border px-2 py-1 text-sm" />
                <input name="apellido" placeholder="Apellido" defaultValue={user.apellido} className="rounded-lg border border-border px-2 py-1 text-sm" />
                <button type="submit" disabled={updatingId === user.id} className="btn-primary rounded-full px-4 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditingNameId(null)} className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground">
                  Cancelar
                </button>
              </form>
            ) : null}

            {resettingId === user.id ? (
              <form
                onSubmit={(e) => handleResetPassword(user.id, e)}
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
              >
                {resetError ? <p className="w-full text-sm text-red-600">{resetError}</p> : null}
                <input type="password" name="newPassword" placeholder="Contraseña nueva" required minLength={8} className="rounded-lg border border-border px-2 py-1 text-sm" />
                <input type="password" name="confirmPassword" placeholder="Confirmar" required minLength={8} className="rounded-lg border border-border px-2 py-1 text-sm" />
                <button type="submit" disabled={updatingId === user.id} className="btn-primary rounded-full px-4 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  Guardar
                </button>
                <button type="button" onClick={() => setResettingId(null)} className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground">
                  Cancelar
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      {creating ? (
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-border p-4">
          <h2 className="text-sm font-bold">Nuevo usuario</h2>
          <div className="grid grid-cols-2 gap-3">
            <input name="nombre" placeholder="Nombre" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <input name="apellido" placeholder="Apellido" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <input name="email" type="email" placeholder="Correo" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="password" type="password" placeholder="Contraseña" required minLength={8} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <select
            name="role"
            required
            value={rolNuevo}
            onChange={(e) => setRolNuevo(e.target.value as UserRole)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
          {eligeSede ? (
            <label className="block text-xs font-semibold text-muted-foreground">
              Sede donde trabaja
              <select value={sedeNueva === "GENERAL" && rolNuevo !== "ADMIN" ? sedes?.actual : (sedeNueva ?? sedes?.actual)} onChange={(e) => setSedeNueva(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                {listaSedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
                {rolNuevo === "ADMIN" ? <option value="GENERAL">Todas las sedes (administrador general)</option> : null}
              </select>
            </label>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-full px-6 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Creando…" : "Crear usuario"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className="btn-primary rounded-full px-4 py-2 text-sm">
          + Nuevo usuario
        </button>
      )}
    </div>
  );
}
