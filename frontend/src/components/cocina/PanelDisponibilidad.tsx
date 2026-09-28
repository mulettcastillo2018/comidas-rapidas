"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
    <section className="mt-4 rounded-xl border border-border">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm">
        <span className="font-bold">
          Productos agotados{" "}
          {agotados.length > 0 ? (
            <span className="font-normal text-red-600">— {agotados.map((p) => p.nombre).join(", ")}</span>
          ) : (
            <span className="font-normal text-muted-foreground">— ninguno</span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto ? (
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">Toca un producto para marcarlo agotado o disponible de nuevo.</p>
          {Array.from(porCategoria.entries()).map(([categoria, lista]) => (
            <div key={categoria}>
              <p className="text-xs font-semibold text-muted-foreground">{categoria}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {lista.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onCambiar(p)}
                    disabled={cambiando === p.id}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                      p.disponible ? "border-border" : "border-red-600 bg-red-50 text-red-700 line-through"
                    }`}
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
