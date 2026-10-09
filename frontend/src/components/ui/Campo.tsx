import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

/** Entradas, selects y áreas de texto comparten borde, alto y anillo de foco. */
export const estilosEntrada =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground " +
  "shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] placeholder:text-muted-foreground/70 " +
  "transition-[border-color,box-shadow] duration-200 ease-salida hover:border-border-strong " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-peligro aria-[invalid=true]:focus:ring-peligro/15";

/** Alto de los controles: "sm" para filas densas (precios, cantidades, filtros). */
export type TamanoCampo = "sm" | "md";
const ALTO: Record<TamanoCampo, string> = { sm: "h-8 rounded-lg px-2.5 text-xs", md: "h-10" };

export function Entrada({ className, tamano = "md", ...props }: Omit<ComponentProps<"input">, "size"> & { tamano?: TamanoCampo }) {
  return <input className={cx(estilosEntrada, ALTO[tamano], className)} {...props} />;
}

/** Select con la flecha del sistema (la nativa cambia según navegador y tema). */
export function Selector({
  className,
  tamano = "md",
  contenedor,
  ...props
}: Omit<ComponentProps<"select">, "size"> & { tamano?: TamanoCampo; /** Clases del envoltorio (ancho, flex). */ contenedor?: string }) {
  return (
    <div className={cx("relative", contenedor)}>
      <select className={cx(estilosEntrada, ALTO[tamano], "cursor-pointer appearance-none", tamano === "sm" ? "pr-7" : "pr-9", className)} {...props} />
      <ChevronDown
        aria-hidden
        className={cx("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground", tamano === "sm" ? "right-2 size-3.5" : "right-3 size-4")}
      />
    </div>
  );
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(estilosEntrada, "min-h-24 py-2.5", className)} {...props} />;
}

/**
 * Etiqueta + control + ayuda o error, enlazados por id para lectores de pantalla.
 * `children` recibe el id y los atributos de accesibilidad para el control.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  className,
  children,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const idNota = `${id}-nota`;
  const nota = error ?? ayuda;
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {etiqueta}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": nota ? idNota : undefined })}
      {nota ? (
        <p id={idNota} className={cx("text-xs", error ? "font-medium text-peligro" : "text-muted-foreground")}>
          {nota}
        </p>
      ) : null}
    </div>
  );
}
