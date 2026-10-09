import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TonoInsignia = "neutro" | "acento" | "exito" | "aviso" | "peligro" | "info";

const TONOS: Record<TonoInsignia, string> = {
  neutro: "bg-surface-2 text-muted-foreground ring-border",
  acento: "bg-accent/10 text-accent ring-accent/20",
  exito: "bg-exito/10 text-exito ring-exito/20",
  aviso: "bg-aviso/10 text-aviso ring-aviso/20",
  peligro: "bg-peligro/10 text-peligro ring-peligro/20",
  info: "bg-info/10 text-info ring-info/20",
};

export function estilosInsignia(tono: TonoInsignia = "neutro") {
  return cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs leading-snug font-semibold ring-1 ring-inset [&_svg]:size-3 [&_svg]:shrink-0", TONOS[tono]);
}

/** Estado corto (Libre, Listo, Atrasado...). El texto dice el estado; el color solo lo refuerza. */
export function Insignia({ tono, className, ...props }: ComponentProps<"span"> & { tono?: TonoInsignia }) {
  return <span className={cx(estilosInsignia(tono), className)} {...props} />;
}

/** Punto de estado con pulso, para "en vivo" o "esperando". */
export function PuntoVivo({ tono = "exito", className }: { tono?: Exclude<TonoInsignia, "neutro">; className?: string }) {
  const color = { acento: "bg-accent", exito: "bg-exito", aviso: "bg-aviso", peligro: "bg-peligro", info: "bg-info" }[tono];
  return (
    <span className={cx("relative inline-flex size-2", className)} aria-hidden>
      <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-60", color)} />
      <span className={cx("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}
