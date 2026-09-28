"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

const TABS = [
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/mesas", label: "Mesas" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/pedidos", label: "Pedidos en vivo" },
  { href: "/admin/mostrador", label: "Mostrador" },
  { href: "/admin/domicilios", label: "Domicilios" },
  { href: "/admin/caja", label: "Caja" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/carta-qr", label: "Carta QR" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">Esta sección es solo para administradores.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold print:hidden">Administración</h1>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3 print:hidden">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
              pathname === tab.href ? "btn-primary" : "bg-muted text-muted-foreground hover:bg-accent hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
