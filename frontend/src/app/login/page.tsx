"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/lib/types";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Motivo por el que el sistema cerró la sesión (cuenta desactivada, rol
  // cambiado...), enviado por cerrarSesionForzada().
  useEffect(() => {
    setAviso(new URLSearchParams(window.location.search).get("aviso"));
  }, []);
  const [remember, setRemember] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth(data.token, data.user, remember);

      if (data.user.role === "COCINA") router.push("/cocina");
      else if (data.user.role === "MESERO") router.push("/mesero");
      else router.push("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="brand-gradient-text text-center text-2xl font-extrabold tracking-tight">Comidas Rápidas</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Acceso de personal</p>
      {aviso ? <p className="mt-4 rounded-lg bg-accent/10 p-3 text-center text-sm text-accent">{aviso}</p> : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Correo</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Contraseña</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Recordar sesión en este dispositivo
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
