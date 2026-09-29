"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { conAlcance, useVerTodas } from "@/lib/sedes";
import { AlcanceSedes } from "@/components/SelectorSede";
import { formatoPesos, hoyLocal } from "@/lib/formato";
import { SelectorRango } from "@/components/reportes/SelectorRango";
import { formatoCantidad, type ConsumoInsumos as Consumo } from "@/lib/insumos";

// Lo que las recetas dicen que se gastó, lo que se compró y lo que faltó al
// contar: la merma es plata que se va sin quedar registrada.
export function ConsumoInsumos({ token }: { token: string }) {
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState<Consumo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todas = useVerTodas();

  useEffect(() => {
    let vigente = true;
    apiFetch<Consumo>(conAlcance(`/insumos/consumo?desde=${desde}&hasta=${hasta}`, todas), { token })
      .then((d) => vigente && setDatos(d))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo cargar el consumo."));
    return () => {
      vigente = false;
    };
  }, [token, desde, hasta, todas]);

  return (
    <div className="space-y-4">
      <AlcanceSedes />
      <SelectorRango
        desde={desde}
        hasta={hasta}
        onCambio={(d, h) => {
          setDesde(d);
          setHasta(h);
        }}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!datos ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : datos.filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos de insumos en estas fechas.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Consumido según recetas</p>
              <p className="text-lg font-extrabold">{formatoPesos(datos.totales.valorConsumo)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Comprado</p>
              <p className="text-lg font-extrabold">{formatoPesos(datos.totales.valorCompras)}</p>
            </div>
            <div className={`rounded-xl border p-3 ${datos.totales.merma > 0 ? "border-red-600" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">Faltó al contar (merma)</p>
              <p className={`text-lg font-extrabold ${datos.totales.merma > 0 ? "text-red-600" : ""}`}>{formatoPesos(datos.totales.merma)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-1.5 pr-4">Insumo</th>
                  <th className="py-1.5 pr-4 text-right">Consumido</th>
                  <th className="py-1.5 pr-4 text-right">Comprado</th>
                  <th className="py-1.5 text-right">Diferencia al contar</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <tr key={f.insumoId} className="border-b border-border/60">
                    <td className="py-1.5 pr-4">{f.nombre}</td>
                    <td className="py-1.5 pr-4 text-right">
                      {formatoCantidad(f.consumo, f.unidad)}
                      <span className="block text-[11px] text-muted-foreground">{formatoPesos(f.valorConsumo)}</span>
                    </td>
                    <td className="py-1.5 pr-4 text-right">
                      {f.compras ? formatoCantidad(f.compras, f.unidad) : "—"}
                      {f.valorCompras ? <span className="block text-[11px] text-muted-foreground">{formatoPesos(f.valorCompras)}</span> : null}
                    </td>
                    <td className={`py-1.5 text-right ${f.diferenciaConteo < 0 ? "text-red-600" : ""}`}>
                      {f.diferenciaConteo ? formatoCantidad(f.diferenciaConteo, f.unidad) : "—"}
                      {f.valorDiferencia ? <span className="block text-[11px]">{formatoPesos(f.valorDiferencia)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
