"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos, hoyLocal } from "@/lib/formato";
import { METODO_PAGO_LABEL } from "@/lib/estados";
import type { ClasificacionMenu, CuentaReporte, ReporteVentas } from "@/lib/types";

const PRODUCTOS_VISIBLES = 10;

// Ingeniería de menú: qué hacer con cada producto según cuánto se vende y
// cuánto deja por unidad, comparado con el resto de la carta.
const CLASIFICACION: Record<ClasificacionMenu, { etiqueta: string; consejo: string; clase: string }> = {
  ESTRELLA: { etiqueta: "⭐ Estrella", consejo: "Se vende mucho y deja buen margen: cuídalo y destácalo.", clase: "bg-green-100 text-green-800" },
  CABALLO: { etiqueta: "🐴 Caballo de batalla", consejo: "Se vende mucho pero deja poco: sube un poco el precio o baja su costo.", clase: "bg-amber-100 text-amber-800" },
  ROMPECABEZAS: { etiqueta: "🧩 Rompecabezas", consejo: "Deja buen margen pero se vende poco: promociónalo, ponlo más visible.", clase: "bg-sky-100 text-sky-800" },
  PERRO: { etiqueta: "🐶 Perro", consejo: "Ni se vende ni deja: piensa en cambiarlo o sacarlo de la carta.", clase: "bg-red-100 text-red-800" },
};

function metodoDeCuenta(c: CuentaReporte) {
  if (c.metodoPago) return METODO_PAGO_LABEL[c.metodoPago];
  return c.pagos.map((p) => `${METODO_PAGO_LABEL[p.metodo]} ${p.monto}`).join(" + ");
}

function rangosRapidos() {
  const hoy = hoyLocal();
  return [
    { label: "Hoy", desde: hoy, hasta: hoy },
    { label: "Ayer", desde: hoyLocal(-1), hasta: hoyLocal(-1) },
    { label: "Últimos 7 días", desde: hoyLocal(-6), hasta: hoy },
    { label: "Últimos 30 días", desde: hoyLocal(-29), hasta: hoy },
    { label: "Este mes", desde: `${hoy.slice(0, 8)}01`, hasta: hoy },
  ];
}

function nombreDia(dia: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`));
}

// Separador ";" y BOM para que Excel en español lo abra con columnas y tildes bien.
function descargarCsv(reporte: ReporteVentas) {
  const celda = (valor: string | number) => `"${String(valor).replace(/"/g, '""')}"`;
  const filas = [
    ["Fecha", "Canal", "Ubicación", "Atendido por", "Estado", "Método de pago", "Subtotal", "Propina", "Total"],
    ...reporte.cuentas.map((c) => [
      formatoFechaHora(c.fecha),
      c.canal === "MESA" ? "Mesa" : "Mostrador",
      c.ubicacion,
      c.atendidoPor,
      c.estado === "PAGADA" ? "Pagada" : "Perdida",
      c.estado === "PAGADA" ? metodoDeCuenta(c) : "",
      c.subtotal,
      c.propina,
      c.total,
    ]),
  ];
  const contenido = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `ventas_${reporte.desde}_a_${reporte.hasta}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

function Tarjeta({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-red-600" : "border-border"}`}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-xl font-extrabold ${alerta ? "text-red-600" : ""}`}>{valor}</p>
      {detalle ? <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p> : null}
    </div>
  );
}

export function ReporteVentasVista({ token }: { token: string }) {
  const [desde, setDesde] = useState(hoyLocal());
  const [hasta, setHasta] = useState(hoyLocal());
  const [reporte, setReporte] = useState<ReporteVentas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTodosProductos, setVerTodosProductos] = useState(false);

  useEffect(() => {
    if (!desde || !hasta) return;
    let vigente = true;
    setCargando(true);
    setError(null);
    apiFetch<ReporteVentas>(`/reportes/ventas?desde=${desde}&hasta=${hasta}`, { token })
      .then((data) => vigente && setReporte(data))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [token, desde, hasta]);

  const maxDia = Math.max(1, ...(reporte?.porDia.map((d) => d.ventas) ?? [0]));
  const productos = reporte ? (verTodosProductos ? reporte.porProducto : reporte.porProducto.slice(0, PRODUCTOS_VISIBLES)) : [];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {rangosRapidos().map((r) => (
            <button
              key={r.label}
              onClick={() => {
                setDesde(r.desde);
                setHasta(r.hasta);
              }}
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
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-border px-2 py-1" />
          </label>
          <label className="flex items-center gap-1.5">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-border px-2 py-1" />
          </label>
          {reporte && reporte.cuentas.length > 0 ? (
            <button onClick={() => descargarCsv(reporte)} className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold">
              <Download size={14} /> Descargar CSV
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!reporte ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}

      {reporte ? (
        <div className={`space-y-8 transition-opacity ${cargando ? "opacity-50" : ""}`}>
          <p className="text-xs text-muted-foreground">
            Cuenta como venta lo cobrado en esas fechas (según la hora en que se cobró). Las propinas están incluidas en las
            ventas; las cuentas perdidas y los productos cancelados no suman.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tarjeta titulo="Ventas" valor={formatoPesos(reporte.resumen.ventas)} detalle={`${reporte.resumen.cuentas} cuenta(s) cobrada(s)`} />
            <Tarjeta titulo="Ticket promedio" valor={formatoPesos(reporte.resumen.ticketPromedio)} detalle="por cuenta" />
            <Tarjeta titulo="Propinas" valor={formatoPesos(reporte.resumen.propinas)} detalle="incluidas en ventas" />
            <Tarjeta
              titulo="Se fueron sin pagar"
              valor={formatoPesos(reporte.resumen.perdidas.total)}
              detalle={`${reporte.resumen.perdidas.cuentas} cuenta(s)`}
              alerta={reporte.resumen.perdidas.cuentas > 0}
            />
            <Tarjeta
              titulo="Cancelado"
              valor={formatoPesos(reporte.resumen.cancelaciones.total)}
              detalle={`${reporte.resumen.cancelaciones.productos} producto(s)`}
            />
            <Tarjeta
              titulo="Merma"
              valor={formatoPesos(reporte.resumen.cancelaciones.merma)}
              detalle={
                reporte.resumen.cancelaciones.costoMerma > 0
                  ? `cancelado ya en cocina · insumos perdidos ${formatoPesos(reporte.resumen.cancelaciones.costoMerma)}`
                  : "cancelado cuando ya estaba en cocina"
              }
              alerta={reporte.resumen.cancelaciones.merma > 0}
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-bold">Ganancia</h2>
            {reporte.resumen.ganancia.ventasConCosto > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tarjeta
                  titulo="Ganancia bruta"
                  valor={formatoPesos(reporte.resumen.ganancia.gananciaBruta)}
                  detalle="ventas de productos − su costo (sin propinas)"
                  alerta={reporte.resumen.ganancia.gananciaBruta < 0}
                />
                <Tarjeta titulo="Margen" valor={`${reporte.resumen.ganancia.margenPct ?? 0}%`} detalle="de cada peso vendido" />
                <Tarjeta titulo="Costo de lo vendido" valor={formatoPesos(reporte.resumen.ganancia.costoVentas)} detalle="insumos y empaques" />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                Para ver cuánto ganas, configura el <strong>costo</strong> de tus productos en Admin → Productos. Se aplica a
                lo que se venda desde ese momento.
              </p>
            )}
            {reporte.resumen.ganancia.productosSinCosto.length > 0 && reporte.resumen.ganancia.ventasConCosto > 0 ? (
              <p className="text-xs text-amber-700">
                Sin costo (su ganancia no se cuenta): {reporte.resumen.ganancia.productosSinCosto.join(", ")}.
              </p>
            ) : null}
          </section>

          {reporte.porDia.length > 1 ? (
            <section>
              <h2 className="text-sm font-bold">Ventas por día</h2>
              <div className="mt-3 space-y-1">
                {reporte.porDia.map((d) => (
                  <div key={d.dia} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 capitalize text-muted-foreground">{nombreDia(d.dia)}</span>
                    <div className="h-4 flex-1 rounded bg-muted">
                      <div className="h-4 rounded bg-accent" style={{ width: `${(d.ventas / maxDia) * 100}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-right font-semibold">{formatoPesos(d.ventas)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="text-sm font-bold">Por método de pago</h2>
              <table className="mt-3 w-full text-left text-sm">
                <tbody>
                  {reporte.porMetodo.length === 0 ? (
                    <tr>
                      <td className="py-1.5 text-muted-foreground">Sin cobros en este rango.</td>
                    </tr>
                  ) : (
                    reporte.porMetodo.map((m) => (
                      <tr key={m.metodo} className="border-b border-border/60">
                        <td className="py-1.5 pr-4">{METODO_PAGO_LABEL[m.metodo]}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{m.cuentas} cuenta(s)</td>
                        <td className="py-1.5 text-right font-semibold">{formatoPesos(m.ventas)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
            <section>
              <h2 className="text-sm font-bold">Por canal</h2>
              <table className="mt-3 w-full text-left text-sm">
                <tbody>
                  {(["MESA", "MOSTRADOR"] as const).map((canal) => (
                    <tr key={canal} className="border-b border-border/60">
                      <td className="py-1.5 pr-4">{canal === "MESA" ? "Mesas" : "Mostrador (para recoger)"}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{reporte.porCanal[canal].cuentas} cuenta(s)</td>
                      <td className="py-1.5 text-right font-semibold">{formatoPesos(reporte.porCanal[canal].ventas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {reporte.porMesero.length > 0 ? (
            <section>
              <h2 className="text-sm font-bold">Por mesero (ventas en mesa)</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4">Mesero</th>
                      <th className="py-1.5 pr-4">Cuentas</th>
                      <th className="py-1.5 pr-4 text-right">Propinas</th>
                      <th className="py-1.5 text-right">Ventas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.porMesero.map((m) => (
                      <tr key={m.meseroId} className="border-b border-border/60">
                        <td className="py-1.5 pr-4">{m.nombre}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{m.cuentas}</td>
                        <td className="py-1.5 pr-4 text-right">{formatoPesos(m.propinas)}</td>
                        <td className="py-1.5 text-right font-semibold">{formatoPesos(m.ventas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {reporte.porProducto.length > 0 ? (
            <section>
              <h2 className="text-sm font-bold">Productos más vendidos</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4">Producto</th>
                      <th className="py-1.5 pr-4">Unidades</th>
                      <th className="py-1.5 pr-4 text-right">Ventas</th>
                      <th className="py-1.5 pr-4 text-right">Ganancia</th>
                      <th className="py-1.5 pr-4 text-right">Margen</th>
                      <th className="py-1.5">En la carta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr key={p.productoId} className="border-b border-border/60">
                        <td className="py-1.5 pr-4">
                          {p.nombre}
                          <span className="block text-[11px] text-muted-foreground">{p.categoria}</span>
                        </td>
                        <td className="py-1.5 pr-4">{p.cantidad}</td>
                        <td className="py-1.5 pr-4 text-right font-semibold">{formatoPesos(p.ventas)}</td>
                        <td className={`py-1.5 pr-4 text-right ${p.ganancia !== null && p.ganancia < 0 ? "text-red-600" : ""}`}>
                          {p.ganancia !== null ? formatoPesos(p.ganancia) : <span className="text-xs text-muted-foreground">sin costo</span>}
                        </td>
                        <td className="py-1.5 pr-4 text-right">{p.margenPct !== null ? `${p.margenPct}%` : "—"}</td>
                        <td className="py-1.5">
                          {p.clasificacion ? (
                            <span
                              title={CLASIFICACION[p.clasificacion].consejo}
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASIFICACION[p.clasificacion].clase}`}
                            >
                              {CLASIFICACION[p.clasificacion].etiqueta}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reporte.porProducto.some((p) => p.clasificacion) ? (
                <details className="mt-2 rounded-lg bg-muted/60 p-2 text-xs">
                  <summary className="cursor-pointer font-semibold">¿Qué significa &quot;En la carta&quot;?</summary>
                  <ul className="mt-2 space-y-1">
                    {(Object.keys(CLASIFICACION) as ClasificacionMenu[]).map((c) => (
                      <li key={c}>
                        <strong>{CLASIFICACION[c].etiqueta}:</strong> {CLASIFICACION[c].consejo}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">Se compara cada producto con el resto de la carta en el rango elegido; solo cuenta lo vendido con costo configurado.</p>
                </details>
              ) : null}
              {reporte.porProducto.length > PRODUCTOS_VISIBLES ? (
                <button onClick={() => setVerTodosProductos((v) => !v)} className="mt-2 text-xs font-semibold text-accent">
                  {verTodosProductos ? "Ver menos" : `Ver los ${reporte.porProducto.length} productos`}
                </button>
              ) : null}
            </section>
          ) : null}

          {reporte.perdidas.length > 0 ? (
            <section>
              <h2 className="text-sm font-bold text-red-600">Cuentas perdidas (se fueron sin pagar)</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4">Fecha</th>
                      <th className="py-1.5 pr-4">Dónde</th>
                      <th className="py-1.5 pr-4">Atendió</th>
                      <th className="py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.perdidas.map((c) => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="py-1.5 pr-4 text-xs text-muted-foreground">{formatoFechaHora(c.fecha)}</td>
                        <td className="py-1.5 pr-4">{c.ubicacion}</td>
                        <td className="py-1.5 pr-4">{c.atendidoPor}</td>
                        <td className="py-1.5 text-right font-semibold text-red-600">{formatoPesos(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {reporte.cancelaciones.length > 0 ? (
            <section>
              <h2 className="text-sm font-bold">Productos cancelados</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4">Fecha</th>
                      <th className="py-1.5 pr-4">Producto</th>
                      <th className="py-1.5 pr-4">Dónde</th>
                      <th className="py-1.5 pr-4">Canceló</th>
                      <th className="py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.cancelaciones.map((c) => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="py-1.5 pr-4 text-xs text-muted-foreground">{formatoFechaHora(c.fecha)}</td>
                        <td className="py-1.5 pr-4">
                          {c.cantidad}× {c.producto}
                          {c.yaEnCocina ? (
                            <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">merma</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-4">{c.ubicacion}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{c.canceladoPor}</td>
                        <td className="py-1.5 text-right">{formatoPesos(c.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {reporte.resumen.cuentas === 0 && reporte.perdidas.length === 0 && reporte.cancelaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hubo movimientos en este rango.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
