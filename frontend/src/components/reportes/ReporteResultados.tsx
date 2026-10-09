"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { conAlcance, useVerTodas } from "@/lib/sedes";
import { formatoPesos, hoyLocal } from "@/lib/formato";
import { CATEGORIA_GASTO_LABEL, type EstadoResultados } from "@/lib/gestion";
import { SelectorRango } from "./SelectorRango";

function Linea({ label, valor, nivel = 0, fuerte, negativo, detalle }: { label: string; valor: number; nivel?: number; fuerte?: boolean; negativo?: boolean; detalle?: string }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1 ${fuerte ? "border-t border-border font-semibold" : ""}`} style={{ paddingLeft: nivel * 16 }}>
      <span className={fuerte ? "" : "text-muted-foreground"}>
        {label}
        {detalle ? <span className="block text-[11px] font-normal text-muted-foreground">{detalle}</span> : null}
      </span>
      <span className={`shrink-0 ${valor < 0 ? "text-peligro" : ""}`}>{negativo && valor > 0 ? `−${formatoPesos(valor)}` : formatoPesos(valor)}</span>
    </div>
  );
}

// Estado de resultados: lo que entró, lo que costó vender, los gastos y lo
// que queda; y cuánto hay que vender para cubrir los gastos fijos.
export function ReporteResultados({ token }: { token: string }) {
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy);
  const [r, setR] = useState<EstadoResultados | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todas = useVerTodas();

  useEffect(() => {
    let vigente = true;
    setError(null);
    apiFetch<EstadoResultados>(conAlcance(`/reportes/resultados?desde=${desde}&hasta=${hasta}`, todas), { token })
      .then((data) => vigente && setR(data))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo cargar el estado de resultados."));
    return () => {
      vigente = false;
    };
  }, [token, desde, hasta, todas]);

  return (
    <div className="space-y-6">
      <SelectorRango
        desde={desde}
        hasta={hasta}
        onCambio={(d, h) => {
          setDesde(d);
          setHasta(h);
        }}
      />
      {error ? <p className="text-sm text-peligro">{error}</p> : null}
      {!r ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{formatoPesos(r.ingresos.total)}</p>
              <p className="text-xs text-muted-foreground">{r.cuentas} cuenta(s), sin propinas</p>
            </div>
            <div className={`rounded-2xl border p-4 bg-surface shadow-suave ${r.utilidadNeta < 0 ? "border-peligro" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">Utilidad neta</p>
              <p className={`mt-1 text-xl font-semibold tracking-tight ${r.utilidadNeta < 0 ? "text-peligro" : "text-exito"}`}>{formatoPesos(r.utilidadNeta)}</p>
              <p className="text-xs text-muted-foreground">{r.margenNetoPct !== null ? `${r.margenNetoPct}% de los ingresos` : "—"}</p>
            </div>
            {r.puntoEquilibrio ? (
              <div className={`col-span-2 rounded-2xl border p-4 sm:col-span-1 bg-surface shadow-suave ${r.puntoEquilibrio.alcanzado ? "border-exito" : "border-aviso"}`}>
                <p className="text-xs text-muted-foreground">Punto de equilibrio</p>
                <p className="mt-1 text-xl font-semibold tracking-tight">{formatoPesos(r.puntoEquilibrio.ventasNecesarias)}</p>
                <p className="text-xs text-muted-foreground">
                  ≈ {formatoPesos(r.puntoEquilibrio.ventasPorDia)} al día · {r.puntoEquilibrio.alcanzado ? "ya lo alcanzaste ✓" : "todavía no se alcanza"}
                </p>
              </div>
            ) : null}
          </div>

          <section className="rounded-2xl border border-border p-4 text-sm bg-surface shadow-suave">
            <h2 className="mb-2 text-sm font-semibold">Estado de resultados</h2>
            <Linea label="Ventas de productos" valor={r.ingresos.ventasProductos} detalle="ya con descuentos y cortesías restados" />
            {r.ingresos.envios > 0 ? <Linea label="Domicilios cobrados" valor={r.ingresos.envios} /> : null}
            <Linea label="Ingresos" valor={r.ingresos.total} fuerte />
            <Linea
              label="Costo de lo vendido"
              valor={r.costoVentas}
              negativo
              nivel={1}
              detalle={r.fuenteCosto === "PRODUCTOS" ? "según el costo configurado en cada producto" : "lo pagado en insumos (configura el costo de tus productos para más precisión)"}
            />
            {r.comisiones > 0 ? <Linea label="Comisiones de apps de domicilios" valor={r.comisiones} negativo nivel={1} /> : null}
            <Linea label="Utilidad bruta" valor={r.utilidadBruta} fuerte />
            {r.gastos.porCategoria.map((g) => (
              <Linea key={g.categoria} label={CATEGORIA_GASTO_LABEL[g.categoria]} valor={g.total} negativo nivel={1} />
            ))}
            {r.gastos.porCategoria.length === 0 ? (
              <p className="py-1 pl-4 text-xs text-muted-foreground">
                Sin gastos registrados. <Link href="/admin/gastos" className="font-semibold text-accent">Regístralos aquí</Link> para ver la utilidad real.
              </p>
            ) : null}
            <Linea label="Utilidad neta" valor={r.utilidadNeta} fuerte />
            {r.gastos.generalesExcluidos > 0 ? (
              <p className="pt-1 text-xs text-muted-foreground">
                No incluye {formatoPesos(r.gastos.generalesExcluidos)} de gastos generales del negocio (no son de una sede): se restan viendo todas las sedes.
              </p>
            ) : null}
          </section>

          {r.fuenteCosto === "PRODUCTOS" && r.comprasInsumos > 0 ? (
            <p className={`rounded-lg p-3 text-xs ${r.comprasInsumos > r.costoVentas * 1.15 ? "bg-aviso/10 text-aviso" : "bg-muted text-muted-foreground"}`}>
              Compraste {formatoPesos(r.comprasInsumos)} en insumos y, según los costos de tus productos, lo vendido gastó{" "}
              {formatoPesos(r.costoVentas)}.
              {r.comprasInsumos > r.costoVentas * 1.15
                ? " Compras bastante más de lo que vendes: puede ser inventario que queda para después, o desperdicio o pérdidas que no se están registrando."
                : " Van parejos."}{" "}
              (Las compras de insumos no se restan otra vez: ya están en el costo de lo vendido.)
            </p>
          ) : null}
          {r.productosSinCosto.length > 0 ? (
            <p className="text-xs text-aviso">Sin costo configurado (su costo no se cuenta): {r.productosSinCosto.join(", ")}.</p>
          ) : null}
          {r.puntoEquilibrio ? (
            <p className="text-xs text-muted-foreground">
              De cada peso vendido te quedan {r.puntoEquilibrio.margenContribucionPct}% después de los costos que dependen de las ventas
              (insumos, comisiones y gastos variables). Con{" "}
              {formatoPesos(r.gastos.fijos)} en gastos fijos en estas fechas, necesitas vender {formatoPesos(r.puntoEquilibrio.ventasNecesarias)} para
              no perder.
            </p>
          ) : r.gastos.fijos === 0 ? (
            <p className="text-xs text-muted-foreground">Marca como &quot;fijos&quot; el arriendo, la nómina y los servicios para calcular el punto de equilibrio.</p>
          ) : null}
          {r.propinas > 0 ? (
            <p className="text-xs text-muted-foreground">Propinas recibidas: {formatoPesos(r.propinas)} (son del personal: no cuentan como ingreso del negocio).</p>
          ) : null}
        </>
      )}
    </div>
  );
}
