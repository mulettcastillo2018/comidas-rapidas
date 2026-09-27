"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { ReporteTiempos } from "@/lib/types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export default function AdminReportesPage() {
  const token = useAuthStore((state) => state.token);
  const [reporte, setReporte] = useState<ReporteTiempos | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<ReporteTiempos>("/reportes/tiempos", { token }).then(setReporte);
  }, [token]);

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
        cocina (desde que se marcó "en preparación" hasta que se marcó "listo").
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-extrabold">{reporte.resumen.totalItems}</p>
          <p className="text-xs text-muted-foreground">Productos analizados</p>
        </div>
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-extrabold">{reporte.resumen.promedioEstimadoMinutos} min</p>
          <p className="text-xs text-muted-foreground">Promedio estimado</p>
        </div>
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-extrabold">{reporte.resumen.promedioRealMinutos} min</p>
          <p className="text-xs text-muted-foreground">Promedio real</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${reporte.resumen.itemsSobreEstimado > 0 ? "border-red-600" : "border-border"}`}>
          <p className={`text-2xl font-extrabold ${reporte.resumen.itemsSobreEstimado > 0 ? "text-red-600" : ""}`}>
            {reporte.resumen.itemsSobreEstimado}
          </p>
          <p className="text-xs text-muted-foreground">Productos sobre el estimado</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold">Por producto</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1.5 pr-4">Producto</th>
                <th className="py-1.5 pr-4">Configurado</th>
                <th className="py-1.5 pr-4">Promedio real</th>
                <th className="py-1.5">Muestras</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porProducto.map((p) => (
                <tr key={p.productoId} className="border-b border-border/60">
                  <td className="py-1.5 pr-4">{p.nombre}</td>
                  <td className="py-1.5 pr-4">{p.tiempoConfiguradoMinutos} min</td>
                  <td className={`py-1.5 pr-4 font-semibold ${p.promedioRealMinutos > p.tiempoConfiguradoMinutos ? "text-red-600" : "text-accent"}`}>
                    {p.promedioRealMinutos} min
                  </td>
                  <td className="py-1.5 text-muted-foreground">{p.muestras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold">Productos despachados recientemente</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1.5 pr-4">Mesa</th>
                <th className="py-1.5 pr-4">Mesero</th>
                <th className="py-1.5 pr-4">Producto</th>
                <th className="py-1.5 pr-4">Estimado</th>
                <th className="py-1.5 pr-4">Real</th>
                <th className="py-1.5">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {reporte.items.map((item) => (
                <tr key={item.pedidoItemId} className="border-b border-border/60">
                  <td className="py-1.5 pr-4">Mesa {item.mesaNumero}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{item.meseroNombre}</td>
                  <td className="py-1.5 pr-4">{item.productoNombre}</td>
                  <td className="py-1.5 pr-4">{item.tiempoEstimadoMinutos} min</td>
                  <td className="py-1.5 pr-4">{item.tiempoRealMinutos} min</td>
                  <td className={`py-1.5 font-semibold ${item.diferenciaMinutos > 0 ? "text-red-600" : "text-accent"}`}>
                    {item.diferenciaMinutos > 0 ? "+" : ""}
                    {item.diferenciaMinutos} min
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
