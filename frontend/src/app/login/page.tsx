"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, ConciergeBell, Flame, Info, MonitorPlay } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { Boton, Campo, Entrada } from "@/components/ui";
import type { AuthUser } from "@/lib/types";

// Panel decorativo de pantallas grandes: los cuatro puestos que usan el sistema.
const PUESTOS = [
  { icono: ConciergeBell, texto: "Meseros: mesas y pedidos por comensal" },
  { icono: ChefHat, texto: "Cocina: despacho producto por producto" },
  { icono: MonitorPlay, texto: "Pantalla: estado de pedidos para el salón" },
];

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
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8">
      {/* Panel de marca (solo en pantallas grandes) */}
      <section
        data-tema="oscuro"
        aria-hidden
        className="relative hidden h-full max-h-[640px] min-h-[520px] animate-aparecer flex-col justify-between overflow-hidden rounded-[2rem] bg-background bg-[radial-gradient(80%_60%_at_100%_0%,rgb(255_107_74/0.22),transparent_70%),radial-gradient(60%_50%_at_0%_100%,rgb(251_191_36/0.10),transparent_70%)] p-10 text-foreground shadow-flotante ring-1 ring-border lg:flex"
      >
        <span className="relative grid size-12 place-items-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento">
          <Flame className="size-6" />
        </span>
        <div className="relative">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
            El servicio del día, <span className="brand-gradient-text">en orden</span>.
          </h2>
          <ul className="mt-8 grid gap-3">
            {PUESTOS.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                <Icono className="size-4 text-accent" />
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Formulario */}
      <section className="mx-auto w-full max-w-sm animate-aparecer [animation-delay:80ms]">
        <div className="mb-8 text-center lg:text-left">
          <span className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento lg:hidden">
            <Flame className="size-6" aria-hidden />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="brand-gradient-text">Comidas Rápidas</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Acceso de personal</p>
        </div>

        {aviso ? (
          <p className="mb-6 flex items-start gap-2.5 rounded-2xl bg-accent/10 p-4 text-sm text-accent ring-1 ring-accent/20 ring-inset">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {aviso}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-border bg-surface p-6 shadow-elevada sm:p-8">
          <Campo etiqueta="Correo">
            {(control) => <Entrada name="email" type="email" required autoComplete="username" className="h-11" {...control} />}
          </Campo>
          <Campo etiqueta="Contraseña">
            {(control) => <Entrada name="password" type="password" required autoComplete="current-password" className="h-11" {...control} />}
          </Campo>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 cursor-pointer rounded accent-accent" />
            Recordar sesión en este dispositivo
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm font-medium text-peligro ring-1 ring-peligro/20 ring-inset">
              {error}
            </p>
          ) : null}

          <Boton type="submit" tamano="lg" bloque cargando={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </Boton>
        </form>
      </section>
    </div>
  );
}
