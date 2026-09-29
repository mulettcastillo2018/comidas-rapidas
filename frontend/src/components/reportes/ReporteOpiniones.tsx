"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { conAlcance, useVerTodas } from "@/lib/sedes";
import { formatoFechaHora, hoyLocal } from "@/lib/formato";
import type { ReporteSatisfaccion } from "@/lib/types";

function Estrellas({ valor }: { valor: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} className={n <= Math.round(valor) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
      ))}
    </span>
  );
}

// Lo que opinan los clientes (encuesta del QR de la precuenta o del
// seguimiento de su pedido de mostrador).
export function ReporteOpiniones({ token }: { token: string }) {
  const [desde, setDesde] = useState(hoyLocal(-29));
  const [hasta, setHasta] = useState(hoyLocal());
  const [reporte, setReporte] = useState<ReporteSatisfaccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todas = useVerTodas();

  useEffect(() => {
    let vigente = true;
    apiFetch<ReporteSatisfaccion>(conAlcance(`/reportes/satisfaccion?desde=${desde}&hasta=${hasta}`, todas), { token })
      .then((data) => vigente && setReporte(data))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
    return () => {
      vigente = false;
    };
  }, [token, desde, hasta, todas]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-border px-2 py-1" />
        </label>
        <label className="flex items-center gap-1.5">
          Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-border px-2 py-1" />
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!reporte ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : reporte.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay opiniones en este rango. Los clientes califican escaneando el QR de la precuenta impresa o desde
          el seguimiento de su pedido de mostrador.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Calificación promedio</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-extrabold">
                {reporte.promedio} <Estrellas valor={reporte.promedio ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground">{reporte.total} opinión(es)</p>
            </div>
            <div className="space-y-1 rounded-xl border border-border p-4 text-xs">
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="w-6">{n}★</span>
                  <div className="h-3 flex-1 rounded bg-muted">
                    <div className={`h-3 rounded ${n <= 2 ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${(reporte.distribucion[n] / reporte.total) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right">{reporte.distribucion[n]}</span>
                </div>
              ))}
            </div>
          </div>

          {reporte.porMesero.length > 0 ? (
            <section>
              <h2 className="text-sm font-bold">Por mesero</h2>
              <table className="mt-2 w-full text-left text-sm">
                <tbody>
                  {reporte.porMesero.map((m) => (
                    <tr key={m.meseroId} className="border-b border-border/60">
                      <td className="py-1.5 pr-4">{m.nombre}</td>
                      <td className="py-1.5 pr-4">
                        <Estrellas valor={m.promedio} /> <span className="text-xs">{m.promedio}</span>
                      </td>
                      <td className="py-1.5 text-right text-xs text-muted-foreground">{m.opiniones} opinión(es)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-bold">Últimas opiniones</h2>
            <ul className="mt-2 space-y-2">
              {reporte.recientes.map((o) => (
                <li key={o.id} className={`rounded-xl border p-3 text-sm ${o.calificacion <= 2 ? "border-red-300 bg-red-50" : "border-border"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Estrellas valor={o.calificacion} />
                    <span className="text-xs text-muted-foreground">
                      {o.contexto}
                      {o.mesero ? ` · atendió ${o.mesero}` : ""} · {formatoFechaHora(o.creadaEn)}
                    </span>
                  </div>
                  {o.comentario ? <p className="mt-1">“{o.comentario}”</p> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
