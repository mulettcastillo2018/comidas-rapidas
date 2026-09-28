"use client";

import type { Producto } from "@/lib/types";

// Lista de casillas para elegir varios productos (agrupados por categoría).
export function SelectorProductos({ productos, elegidos, onChange }: { productos: Producto[]; elegidos: string[]; onChange: (ids: string[]) => void }) {
  const grupos = new Map<string, Producto[]>();
  for (const p of productos) grupos.set(p.categoria?.nombre ?? "Otros", [...(grupos.get(p.categoria?.nombre ?? "Otros") ?? []), p]);

  function alternar(id: string) {
    onChange(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);
  }

  return (
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-2 text-xs">
      {Array.from(grupos.entries()).map(([categoria, lista]) => (
        <div key={categoria}>
          <p className="font-semibold text-muted-foreground">{categoria}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {lista.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={elegidos.includes(p.id)} onChange={() => alternar(p.id)} />
                {p.nombre}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
