"use client";

import { MapPin } from "lucide-react";
import { activas, elegirSede, nombreActual, useAlcanceSedes, useSedes } from "@/lib/sedes";

// En la barra: la sede en la que se trabaja. El administrador general la
// elige; los demás solo la ven. Con una sola sede no se muestra nada.
export function SelectorSede() {
  const sedes = useSedes();
  const lista = activas(sedes);
  if (!sedes || lista.length < 2) return null;

  if (!sedes.puedeCambiar) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground" title="Tu sede">
        <MapPin size={14} />
        {nombreActual(sedes)}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground" title="Sede en la que estás trabajando">
      <MapPin size={14} />
      <select
        value={sedes.actual}
        onChange={(e) => elegirSede(e.target.value)}
        className="rounded-lg border border-border bg-background px-1.5 py-1 text-xs font-semibold text-foreground"
      >
        {lista.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
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
