"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgePercent,
  Bike,
  Boxes,
  Building2,
  ChartColumn,
  Clock,
  FileCheck2,
  LayoutGrid,
  Package,
  QrCode,
  Receipt,
  Star,
  Store,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Contenedor, cx, EncabezadoPagina } from "@/components/ui";

interface Seccion {
  href: string;
  label: string;
  icono: LucideIcon;
  descripcion: string;
}

// Las mismas secciones de antes, agrupadas por tarea en una barra lateral.
const GRUPOS: { titulo: string; secciones: Seccion[] }[] = [
  {
    titulo: "Catálogo",
    secciones: [
      { href: "/admin/categorias", label: "Categorías", icono: Tags, descripcion: "Cómo se agrupa la carta y el ícono de cada grupo." },
      { href: "/admin/productos", label: "Productos", icono: Package, descripcion: "Precios, fotos, costos y disponibilidad de cada producto." },
      { href: "/admin/inventario", label: "Inventario", icono: Boxes, descripcion: "Existencias de productos e insumos, y recetas." },
      { href: "/admin/ofertas", label: "Ofertas", icono: BadgePercent, descripcion: "Adiciones, combos y promociones." },
      { href: "/admin/carta-qr", label: "Carta QR", icono: QrCode, descripcion: "Códigos QR de las mesas y del mostrador para imprimir." },
    ],
  },
  {
    titulo: "Operación",
    secciones: [
      { href: "/admin/pedidos", label: "Pedidos en vivo", icono: Activity, descripcion: "Lo que está en curso en este momento." },
      { href: "/admin/mostrador", label: "Mostrador", icono: Store, descripcion: "Pedidos para recoger: confirmar en caja y seguir su preparación." },
      { href: "/admin/domicilios", label: "Domicilios", icono: Bike, descripcion: "Domicilios propios y de apps, y lo que es para llevar." },
      { href: "/admin/mesas", label: "Mesas", icono: LayoutGrid, descripcion: "Mesas, capacidad y mesero asignado." },
      { href: "/admin/sedes", label: "Sedes", icono: Building2, descripcion: "Los locales del negocio." },
      { href: "/admin/usuarios", label: "Usuarios", icono: Users, descripcion: "Personal, roles y accesos." },
    ],
  },
  {
    titulo: "Finanzas",
    secciones: [
      { href: "/admin/caja", label: "Caja", icono: Wallet, descripcion: "Cobros del día, movimientos y cierre de caja." },
      { href: "/admin/facturacion", label: "Facturación electrónica", icono: FileCheck2, descripcion: "Configuración y documentos electrónicos." },
      { href: "/admin/clientes", label: "Clientes y puntos", icono: Star, descripcion: "Clientes frecuentes y su programa de puntos." },
      { href: "/admin/gastos", label: "Gastos", icono: Receipt, descripcion: "Gastos del negocio." },
      { href: "/admin/personal", label: "Turnos y propinas", icono: Clock, descripcion: "Horas trabajadas y reparto de propinas." },
    ],
  },
  {
    titulo: "Análisis",
    secciones: [{ href: "/admin/reportes", label: "Reportes", icono: ChartColumn, descripcion: "Ventas, resultados, demanda, tiempos de cocina y opiniones." }],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  if (!user || user.role !== "ADMIN") {
    return (
      <Contenedor ancho="medio" className="text-center">
        <p className="text-muted-foreground">Esta sección es solo para administradores.</p>
      </Contenedor>
    );
  }

  const grupoActual = GRUPOS.find((g) => g.secciones.some((s) => s.href === pathname));
  const seccionActual = grupoActual?.secciones.find((s) => s.href === pathname);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
        {/* Navegación: barra lateral en pantallas grandes, fila desplazable en el celular. */}
        <aside className="print:hidden lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
          <p className="hidden px-3 text-xs font-semibold tracking-[0.14em] text-accent uppercase lg:block">Administración</p>
          <nav aria-label="Administración" className="lg:mt-4 lg:grid lg:gap-4">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
              {GRUPOS.flatMap((g) => g.secciones).map(({ href, label, icono: Icono }) => {
                const activa = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={activa ? "page" : undefined}
                    className={cx(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition-colors duration-200",
                      activa ? "bg-foreground text-background ring-foreground" : "bg-surface text-muted-foreground ring-border hover:text-foreground",
                    )}
                  >
                    <Icono className="size-4" aria-hidden />
                    {label}
                  </Link>
                );
              })}
            </div>
            {GRUPOS.map((grupo) => (
              <div key={grupo.titulo} className="hidden lg:block">
                <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{grupo.titulo}</p>
                <ul className="mt-1 grid gap-px">
                  {grupo.secciones.map(({ href, label, icono: Icono }) => {
                    const activa = pathname === href;
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={activa ? "page" : undefined}
                          className={cx(
                            "group flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-salida",
                            activa ? "bg-surface text-foreground shadow-suave ring-1 ring-border" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                          )}
                        >
                          <Icono
                            className={cx("size-4 transition-colors", activa ? "text-accent" : "text-muted-foreground group-hover:text-foreground")}
                            aria-hidden
                          />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {seccionActual ? (
            <EncabezadoPagina
              key={seccionActual.href}
              antetitulo={grupoActual?.titulo}
              titulo={seccionActual.label}
              descripcion={seccionActual.descripcion}
              className="animate-aparecer print:hidden"
            />
          ) : null}
          <div className="mt-6 sm:mt-8">{children}</div>
        </section>
      </div>
    </div>
  );
}
