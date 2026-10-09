"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { conAlcance, useVerTodas } from "@/lib/sedes";
import { formatoFechaHora } from "@/lib/formato";
import type { ReporteTiempos } from "@/lib/types";

export function ReporteTiemposCocina({ token }: { token: string }) {
  const [reporte, setReporte] = useState<ReporteTiempos | null>(null);
  const todas = useVerTodas();

  useEffect(() => {
    apiFetch<ReporteTiempos>(conAlcance("/reportes/tiempos", todas), { token }).then(setReporte);
  }, [token, todas]);

  if (!reporte) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (reporte.resumen.totalItems === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay productos despachados (con inicio y fin de preparación registrados) para comparar.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Compara, producto por producto, el tiempo de preparación configurado en el menú contra lo que realmente tardó
        cocina (desde que se marcó &quot;en preparación&quot; hasta que se marcó &quot;listo&quot;).
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border p-4 text-center bg-surface shadow-suave">
          <p className="text-2xl font-semibold tracking-tight">{reporte.resumen.totalItems}</p>
          <p className="text-xs text-muted-foreground">Productos analizados</p>
        </div>
        <div className="rounded-2xl border border-border p-4 text-center bg-surface shadow-suave">
          <p className="text-2xl font-semibold tracking-tight">{reporte.resumen.promedioEstimadoMinutos} min</p>
          <p className="text-xs text-muted-foreground">Promedio estimado</p>
        </div>
        <div className="rounded-2xl border border-border p-4 text-center bg-surface shadow-suave">
          <p className="text-2xl font-semibold tracking-tight">{reporte.resumen.promedioRealMinutos} min</p>
          <p className="text-xs text-muted-foreground">Promedio real</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center bg-surface shadow-suave ${reporte.resumen.itemsSobreEstimado > 0 ? "border-peligro" : "border-border"}`}>
          <p className={`text-2xl font-semibold tracking-tight ${reporte.resumen.itemsSobreEstimado > 0 ? "text-peligro" : ""}`}>
            {reporte.resumen.itemsSobreEstimado}
          </p>
          <p className="text-xs text-muted-foreground">Productos sobre el estimado</p>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Por producto</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground font-medium">
                <th className="py-2.5 pr-4">Producto</th>
                <th className="py-2.5 pr-4">Configurado</th>
                <th className="py-2.5 pr-4">Promedio real</th>
                <th className="py-2.5">Muestras</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porProducto.map((p) => (
                <tr key={p.productoId} className="border-b border-border/60 transition-colors hover:bg-surface-2/60">
                  <td className="py-2.5 pr-4">{p.nombre}</td>
                  <td className="py-2.5 pr-4">{p.tiempoConfiguradoMinutos} min</td>
                  <td className={`py-2.5 pr-4 font-semibold ${p.promedioRealMinutos > p.tiempoConfiguradoMinutos ? "text-peligro" : "text-accent"}`}>
                    {p.promedioRealMinutos} min
                  </td>
                  <td className="py-2.5 text-muted-foreground">{p.muestras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Productos despachados recientemente</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground font-medium">
                <th className="py-2.5 pr-4">Mesa</th>
                <th className="py-2.5 pr-4">Mesero</th>
                <th className="py-2.5 pr-4">Producto</th>
                <th className="py-2.5 pr-4">Estimado</th>
                <th className="py-2.5 pr-4">Real</th>
                <th className="py-2.5 pr-4">Diferencia</th>
                <th className="py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {reporte.items.map((item) => (
                <tr key={item.pedidoItemId} className="border-b border-border/60 transition-colors hover:bg-surface-2/60">
                  <td className="py-2.5 pr-4">{item.mesaNumero}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{item.meseroNombre}</td>
                  <td className="py-2.5 pr-4">{item.productoNombre}</td>
                  <td className="py-2.5 pr-4">{item.tiempoEstimadoMinutos} min</td>
                  <td className="py-2.5 pr-4">{item.tiempoRealMinutos} min</td>
                  <td className={`py-2.5 pr-4 font-semibold ${item.diferenciaMinutos > 0 ? "text-peligro" : "text-accent"}`}>
                    {item.diferenciaMinutos > 0 ? "+" : ""}
                    {item.diferenciaMinutos} min
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">{formatoFechaHora(item.creadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
