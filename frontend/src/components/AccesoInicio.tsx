"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { estilosBoton } from "@/components/ui";
import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/lib/types";

const PANEL: Record<UserRole, string> = {
  ADMIN: "/admin",
  MESERO: "/mesero",
  COCINA: "/cocina",
  PANTALLA: "/pantalla",
};

/** Botón principal del inicio: ingresar, o ir al panel del rol si ya hay sesión. */
export function AccesoInicio() {
  const user = useAuthStore((state) => state.user);
  return (
    <Link href={user ? PANEL[user.role] : "/login"} className={`${estilosBoton({ tamano: "lg" })} group`}>
      {user ? "Ir a mi panel" : "Ingresar"}
      <ArrowRight className="transition-transform duration-300 ease-resorte group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}
