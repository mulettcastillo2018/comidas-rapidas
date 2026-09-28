"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { NotificationBell } from "@/components/NotificationBell";
import { nombreCompleto } from "@/lib/nombre";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MESERO: "Mesero",
  COCINA: "Cocina",
  PANTALLA: "Pantalla",
};

export function Navbar() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.show);
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
    showToast("Sesión cerrada");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="brand-gradient-text text-xl font-extrabold tracking-tight">
          Comidas Rápidas
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium">
          {user?.role === "MESERO" || user?.role === "ADMIN" ? (
            <Link href="/mesero" className="text-muted-foreground hover:text-foreground">
              Mesero
            </Link>
          ) : null}
          {user?.role === "COCINA" || user?.role === "ADMIN" ? (
            <Link href="/cocina" className="text-muted-foreground hover:text-foreground">
              Cocina
            </Link>
          ) : null}
          {user?.role === "PANTALLA" || user?.role === "ADMIN" ? (
            <Link href="/pantalla" className="text-muted-foreground hover:text-foreground">
              Pantalla
            </Link>
          ) : null}
          {user?.role === "ADMIN" ? (
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          ) : null}
          {user ? (
            <>
              <NotificationBell />
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">{nombreCompleto(user)}</span>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Ingresar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
