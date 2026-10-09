import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const BASE = "rounded-2xl border border-border bg-surface shadow-suave";

/** Se levanta un poco al pasar el mouse: para tarjetas que se pueden tocar. */
const INTERACTIVA =
  "transition-[transform,box-shadow,border-color] duration-300 ease-salida " +
  "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevada active:translate-y-0 active:scale-[0.99]";

/** Vidrio esmerilado: para lo que flota sobre el contenido (barras, paneles fijos). */
const VIDRIO = "rounded-2xl border border-border/60 bg-surface/70 shadow-elevada backdrop-blur-xl backdrop-saturate-150";

export function estilosTarjeta({ interactiva = false, vidrio = false }: { interactiva?: boolean; vidrio?: boolean } = {}) {
  return cx(vidrio ? VIDRIO : BASE, interactiva && INTERACTIVA);
}

export function Tarjeta({
  interactiva,
  vidrio,
  className,
  ...props
}: ComponentProps<"div"> & { interactiva?: boolean; vidrio?: boolean }) {
  return <div className={cx(estilosTarjeta({ interactiva, vidrio }), className)} {...props} />;
}

/** Título y acciones de una tarjeta, con el mismo margen en todas. */
export function CabeceraTarjeta({ titulo, descripcion, acciones, className }: { titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
        {descripcion ? <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
