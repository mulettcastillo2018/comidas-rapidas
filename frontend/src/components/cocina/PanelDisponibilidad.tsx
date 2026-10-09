"use client";

import { useState } from "react";
import { ChevronDown, PackageX } from "lucide-react";
import { cx } from "@/components/ui";
import type { Producto } from "@/lib/types";

// Cocina es quien sabe qué se acabó: al marcarlo, los meseros dejan de poder
// pedirlo y desaparece de la carta del QR, al instante.
export function PanelDisponibilidad({
  productos,
  cambiando,
  onCambiar,
}: {
  productos: Producto[];
  cambiando: string | null;
  onCambiar: (producto: Producto) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const agotados = productos.filter((p) => !p.disponible);
  const porCategoria = new Map<string, Producto[]>();
  for (const p of productos) {
    const categoria = p.categoria?.nombre ?? "Sin categoría";
    porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), p]);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-suave">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm transition-colors duration-200 hover:bg-surface-2"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <PackageX className={cx("size-4 shrink-0", agotados.length > 0 ? "text-peligro" : "text-muted-foreground")} aria-hidden />
          <span className="min-w-0">
            <span className="font-semibold">Productos agotados</span>{" "}
            {agotados.length > 0 ? (
              <span className="text-peligro">— {agotados.map((p) => p.nombre).join(", ")}</span>
            ) : (
              <span className="text-muted-foreground">— ninguno</span>
            )}
          </span>
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-resorte", abierto && "rotate-180")} />
      </button>
      {abierto ? (
        <div className="animate-aparecer space-y-4 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Toca un producto para marcarlo agotado o disponible de nuevo.</p>
          {Array.from(porCategoria.entries()).map(([categoria, lista]) => (
            <div key={categoria}>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{categoria}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lista.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onCambiar(p)}
                    disabled={cambiando === p.id}
                    aria-pressed={!p.disponible}
                    className={cx(
                      "rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all duration-200 ease-resorte active:scale-95 disabled:opacity-50",
                      p.disponible
                        ? "bg-surface-2 text-foreground ring-border hover:ring-border-strong"
                        : "bg-peligro/10 text-peligro line-through ring-peligro/40",
                    )}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
