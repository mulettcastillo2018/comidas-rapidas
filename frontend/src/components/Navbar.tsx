"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, ConciergeBell, Flame, LayoutDashboard, LogOut, Menu, MonitorPlay, X, type LucideIcon } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { NotificationBell } from "@/components/NotificationBell";
import { BotonTurno } from "@/components/BotonTurno";
import { SelectorSede } from "@/components/SelectorSede";
import { cx, estilosBoton, Insignia } from "@/components/ui";
import { nombreCompleto } from "@/lib/nombre";
import { useClicFuera } from "@/lib/useClicFuera";
import type { AuthUser, UserRole } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MESERO: "Mesero",
  COCINA: "Cocina",
  PANTALLA: "Pantalla",
};

// Secciones de la barra según el rol (el administrador ve todas).
const ENLACES: { href: string; label: string; icono: LucideIcon; roles: UserRole[] }[] = [
  { href: "/mesero", label: "Mesero", icono: ConciergeBell, roles: ["MESERO", "ADMIN"] },
  { href: "/cocina", label: "Cocina", icono: ChefHat, roles: ["COCINA", "ADMIN"] },
  { href: "/pantalla", label: "Pantalla", icono: MonitorPlay, roles: ["PANTALLA", "ADMIN"] },
  { href: "/admin", label: "Admin", icono: LayoutDashboard, roles: ["ADMIN"] },
];

const esActiva = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// Los tableros (cocina y pantalla) usan todo el ancho: la barra se alinea con ellos.
const esTablero = (pathname: string) => /^\/(cocina|pantalla)(\/|$)/.test(pathname);

function iniciales(user: AuthUser) {
  return [user.nombre, user.apellido]
    .filter(Boolean)
    .map((parte) => parte.trim()[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function Marca() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Comidas Rápidas, inicio">
      <span className="grid size-8 place-items-center rounded-xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento transition-transform duration-300 ease-resorte group-hover:scale-105 group-hover:-rotate-6">
        <Flame className="size-4" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">Comidas Rápidas</span>
    </Link>
  );
}

function MenuUsuario({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  const ref = useClicFuera<HTMLDivElement>(abierto, cerrar);
  const nombre = nombreCompleto(user);
  const rol = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        title={nombre}
        className="flex items-center gap-2.5 rounded-full p-0.5 transition-colors duration-200 hover:bg-surface-2 lg:pr-3"
      >
        <span className="grid size-8 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">{iniciales(user)}</span>
        <span className="hidden max-w-40 flex-col items-start leading-tight lg:flex">
          <span className="w-full truncate text-sm font-semibold">{nombre}</span>
          <span className="text-xs text-muted-foreground">{rol}</span>
        </span>
      </button>
      {abierto ? (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-64 origin-top-right animate-emerger rounded-2xl border border-border bg-surface p-2 shadow-flotante"
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">{iniciales(user)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{nombre}</p>
              <Insignia tono="acento" className="mt-1">
                {rol}
              </Insignia>
            </div>
          </div>
          <div className="my-1.5 h-px bg-border" />
          <button
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Navbar() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.show);
  const router = useRouter();
  const pathname = usePathname();
  const [menuMovil, setMenuMovil] = useState(false);

  function handleLogout() {
    setMenuMovil(false);
    logout();
    router.push("/login");
    showToast("Sesión cerrada");
  }

  const enlaces = user ? ENLACES.filter((enlace) => enlace.roles.includes(user.role)) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl backdrop-saturate-150 print:hidden">
      <div className={cx("mx-auto flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8", esTablero(pathname) ? "max-w-[1920px]" : "max-w-7xl")}>
        <Marca />

        {enlaces.length ? (
          <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 lg:flex">
            {enlaces.map(({ href, label, icono: Icono }) => {
              const activa = esActiva(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={activa ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ease-salida",
                    activa
                      ? "bg-surface text-foreground shadow-suave ring-1 ring-border"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Icono className={cx("size-4", activa ? "text-accent" : "")} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <div className="hidden md:block">
                <SelectorSede />
              </div>
              <BotonTurno />
              <NotificationBell />
              <MenuUsuario user={user} onLogout={handleLogout} />
              {enlaces.length ? (
                <button
                  onClick={() => setMenuMovil((v) => !v)}
                  aria-expanded={menuMovil}
                  aria-label={menuMovil ? "Cerrar menú" : "Abrir menú"}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground lg:hidden"
                >
                  {menuMovil ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
              ) : null}
            </>
          ) : (
            <Link href="/login" className={estilosBoton({ variante: "secundario", tamano: "sm" })}>
              Ingresar
            </Link>
          )}
        </div>
      </div>

      {user && menuMovil ? (
        <div className="animate-aparecer border-t border-border/70 lg:hidden">
          <nav aria-label="Principal" className="mx-auto grid max-w-7xl gap-1 px-4 py-3 sm:grid-cols-2 sm:px-6">
            {enlaces.map(({ href, label, icono: Icono }) => {
              const activa = esActiva(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuMovil(false)}
                  aria-current={activa ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors duration-200",
                    activa ? "bg-surface text-foreground shadow-suave ring-1 ring-border" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Icono className={cx("size-5", activa ? "text-accent" : "")} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 md:hidden">
            <SelectorSede />
          </div>
        </div>
      ) : null}
    </header>
  );
}
