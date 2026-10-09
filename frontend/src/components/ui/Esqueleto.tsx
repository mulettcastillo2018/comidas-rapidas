import { cx } from "./cx";

/** Marcador de carga con brillo que recorre el bloque (se detiene con movimiento reducido). */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "animate-brillo rounded-xl bg-[length:200%_100%] bg-linear-to-r from-surface-2 via-border/60 to-surface-2",
        className,
      )}
    />
  );
}
