"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import type { UserRole } from "@/lib/types";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MESERO: "Mesero",
  COCINA: "Cocina",
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
          name: field("name"),
          email: field("email"),
          password: field("password"),
          role: field("role"),
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

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {usuarios.map((user) => (
          <div key={user.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {user.name} {!user.isActive ? <span className="text-red-600">(desactivado)</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {user.email} · Desde {formatDate(user.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
          <input name="name" placeholder="Nombre" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="Correo" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="password" type="password" placeholder="Contraseña" required minLength={8} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <select name="role" required defaultValue="MESERO" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
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
