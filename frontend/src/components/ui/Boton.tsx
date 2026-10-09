import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "./cx";

export type VarianteBoton = "primario" | "secundario" | "fantasma" | "peligro" | "peligroSuave" | "exito";
export type TamanoBoton = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none " +
  "transition-[transform,box-shadow,background-color,border-color,color,filter] duration-200 ease-resorte " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTES: Record<VarianteBoton, string> = {
  // Una sola acción principal por bloque: el color de marca se reserva para ella.
  primario: "bg-accent text-accent-foreground shadow-acento hover:-translate-y-px hover:brightness-110",
  secundario: "border border-border bg-surface text-foreground shadow-suave hover:border-border-strong hover:bg-surface-2",
  fantasma: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  peligro: "bg-peligro text-white shadow-suave hover:-translate-y-px hover:brightness-110 dark:text-background",
  exito: "bg-exito text-white shadow-suave hover:-translate-y-px hover:brightness-110 dark:text-background",
  // Para cancelar o anular sin que pese tanto como la acción principal.
  peligroSuave: "text-peligro ring-1 ring-peligro/30 ring-inset hover:bg-peligro/10",
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs [&_svg]:size-3.5",
  md: "h-10 gap-2 rounded-xl px-4 text-sm [&_svg]:size-4",
  lg: "h-12 gap-2 rounded-xl px-6 text-base [&_svg]:size-5",
};

interface OpcionesBoton {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Ocupa todo el ancho disponible. */
  bloque?: boolean;
}

/** Clases de botón, para usarlas también en enlaces (<Link className={estilosBoton()} />). */
export function estilosBoton({ variante = "primario", tamano = "md", bloque = false }: OpcionesBoton = {}) {
  return cx(BASE, VARIANTES[variante], TAMANOS[tamano], bloque && "w-full");
}

export function Boton({
  variante,
  tamano,
  bloque,
  cargando = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & OpcionesBoton & { cargando?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(estilosBoton({ variante, tamano, bloque }), className)}
      {...props}
    >
      {cargando ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
