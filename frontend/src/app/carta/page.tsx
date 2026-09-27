"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { CategoriaConCarta } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function CartaPage() {
  const [categorias, setCategorias] = useState<CategoriaConCarta[] | null>(null);

  useEffect(() => {
    apiFetch<CategoriaConCarta[]>("/carta").then(setCategorias);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="brand-gradient-text text-center text-3xl font-extrabold tracking-tight">Comidas Rápidas</h1>
      <p className="mt-2 text-center text-muted-foreground">Nuestra carta</p>

      {!categorias ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : categorias.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Todavía no hay productos disponibles.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {categorias.map((categoria) => {
            const CategoriaIcon = getCategoryIcon(categoria.icono);
            return (
              <section key={categoria.id}>
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <CategoriaIcon size={18} className="text-accent" />
                  <h2 className="text-lg font-bold">{categoria.nombre}</h2>
                </div>
                <div className="mt-3 space-y-3">
                  {categoria.productos.map((producto) => (
                    <div key={producto.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{producto.nombre}</p>
                        <p className="text-sm text-muted-foreground">{producto.descripcion}</p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatCOP(producto.precio)}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
