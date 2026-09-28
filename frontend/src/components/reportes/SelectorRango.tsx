"use client";

import { hoyLocal } from "@/lib/formato";

export function rangosRapidos() {
  const hoy = hoyLocal();
  const primeroDelMes = `${hoy.slice(0, 8)}01`;
  // Último día del mes anterior = el día antes del primero de este mes.
  const finMesAnterior = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(new Date(`${primeroDelMes}T00:00:00Z`).getTime() - 86_400_000));
  return [
    { label: "Hoy", desde: hoy, hasta: hoy },
    { label: "Últimos 7 días", desde: hoyLocal(-6), hasta: hoy },
    { label: "Este mes", desde: primeroDelMes, hasta: hoy },
    { label: "Mes pasado", desde: `${finMesAnterior.slice(0, 8)}01`, hasta: finMesAnterior },
  ];
}

// Rango de fechas con atajos (hoy, esta semana, este mes, mes pasado).
export function SelectorRango({
  desde,
  hasta,
  onCambio,
}: {
  desde: string;
  hasta: string;
  onCambio: (desde: string, hasta: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {rangosRapidos().map((r) => (
          <button
            key={r.label}
            onClick={() => onCambio(r.desde, r.hasta)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              desde === r.desde && hasta === r.hasta ? "btn-primary" : "bg-muted text-muted-foreground hover:bg-accent hover:text-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => onCambio(e.target.value, hasta)} className="rounded-lg border border-border px-2 py-1" />
        </label>
        <label className="flex items-center gap-1.5">
          Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => onCambio(desde, e.target.value)} className="rounded-lg border border-border px-2 py-1" />
        </label>
      </div>
    </div>
  );
}
