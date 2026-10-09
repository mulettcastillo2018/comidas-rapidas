import type { ReactNode } from "react";
import { cx } from "./cx";

/** Título de pantalla: antetítulo opcional, título, descripción y acciones a la derecha. */
export function EncabezadoPagina({
  antetitulo,
  titulo,
  descripcion,
  acciones,
  className,
}: {
  antetitulo?: ReactNode;
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-3xl">
        {antetitulo ? <p className="mb-1.5 text-xs font-semibold tracking-[0.14em] text-accent uppercase">{antetitulo}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{titulo}</h1>
        {descripcion ? <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

/** Ancho y márgenes de página: respiran más a medida que crece la pantalla. */
export function Contenedor({ ancho = "amplio", className, children }: { ancho?: "angosto" | "medio" | "amplio" | "total"; className?: string; children: ReactNode }) {
  const maximo = { angosto: "max-w-md", medio: "max-w-3xl", amplio: "max-w-7xl", total: "max-w-[1920px]" }[ancho];
  return <div className={cx("mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12", maximo, className)}>{children}</div>;
}
