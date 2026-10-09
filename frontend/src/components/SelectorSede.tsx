"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { activas, elegirSede, nombreActual, useAlcanceSedes, useSedes } from "@/lib/sedes";

// En la barra: la sede en la que se trabaja. El administrador general la
// elige; los demás solo la ven. Con una sola sede no se muestra nada.
export function SelectorSede() {
  const sedes = useSedes();
  const lista = activas(sedes);
  if (!sedes || lista.length < 2) return null;

  if (!sedes.puedeCambiar) {
    return (
      <span className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground ring-1 ring-border ring-inset" title="Tu sede">
        <MapPin className="size-3.5 text-accent" aria-hidden />
        {nombreActual(sedes)}
      </span>
    );
  }

  return (
    <label
      className="relative flex h-9 items-center rounded-full bg-surface text-xs font-semibold ring-1 ring-border transition-shadow duration-200 ring-inset focus-within:ring-2 focus-within:ring-accent/40 hover:ring-border-strong"
      title="Sede en la que estás trabajando"
    >
      <MapPin className="pointer-events-none absolute left-3 size-3.5 text-accent" aria-hidden />
      <span className="sr-only">Sede</span>
      <select
        value={sedes.actual}
        onChange={(e) => elegirSede(e.target.value)}
        className="h-full max-w-48 cursor-pointer appearance-none truncate rounded-full bg-transparent pr-8 pl-8 text-foreground outline-none"
      >
        {lista.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" aria-hidden />
    </label>
  );
}

// En los reportes: ver la sede actual o todas juntas (solo el administrador
// general, con más de una sede).
export function AlcanceSedes() {
  const sedes = useSedes();
  const todas = useAlcanceSedes((s) => s.todas);
  const setTodas = useAlcanceSedes((s) => s.setTodas);
  if (!sedes?.puedeCambiar || activas(sedes).length < 2) return null;
  const opciones = [
    { valor: false, label: nombreActual(sedes) ?? "Esta sede" },
    { valor: true, label: "Todas las sedes" },
  ];
  return (
    <div className="flex w-fit gap-1 rounded-full bg-muted p-1 text-xs font-semibold print:hidden">
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          onClick={() => setTodas(o.valor)}
          className={`rounded-full px-3 py-1 ${todas === o.valor ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
