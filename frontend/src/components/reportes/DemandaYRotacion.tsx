"use client";

import { formatoPesos } from "@/lib/formato";
import type { ReporteVentas } from "@/lib/types";

function nombreHora(h: number) {
  if (h === 0) return "12 a. m.";
  if (h === 12) return "12 m.";
  return h < 12 ? `${h} a. m.` : `${h - 12} p. m.`;
}

function duracion(minutos: number | null) {
  if (minutos === null) return "—";
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function Barra({ etiqueta, valor, maximo, detalle }: { etiqueta: string; valor: number; maximo: number; detalle: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{etiqueta}</span>
      <div className="h-4 flex-1 rounded bg-muted">
        <div className="h-4 rounded bg-accent" style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%` }} />
      </div>
      <span className="w-32 shrink-0 text-right">{detalle}</span>
    </div>
  );
}

// ¿A qué horas y qué días se llena? (para armar los turnos) y ¿cuánto dura
// una mesa ocupada? (para saber cuántos grupos caben en un día).
export function DemandaYRotacion({ reporte }: { reporte: ReporteVentas }) {
  const horasConMovimiento = reporte.porHora.filter((h) => h.pedidos > 0);
  const desde = horasConMovimiento.length ? Math.min(...horasConMovimiento.map((h) => h.hora)) : 0;
  const hasta = horasConMovimiento.length ? Math.max(...horasConMovimiento.map((h) => h.hora)) : -1;
  const horas = reporte.porHora.filter((h) => h.hora >= desde && h.hora <= hasta);
  const maxHora = Math.max(0, ...horas.map((h) => h.pedidos));
  const horaPico = horas.reduce<(typeof horas)[number] | null>((mejor, h) => (!mejor || h.pedidos > mejor.pedidos ? h : mejor), null);
  const promedios = reporte.porDiaSemana.map((d) => ({ ...d, promedio: d.dias > 0 ? Math.round(d.ventas / d.dias) : 0 }));
  const maxDia = Math.max(0, ...promedios.map((d) => d.promedio));
  const r = reporte.rotacion;

  return (
    <>
      {horas.length > 0 ? (
        <section>
          <h2 className="text-sm font-bold">¿A qué hora llegan los pedidos?</h2>
          <p className="text-xs text-muted-foreground">
            Pedidos por hora del día en el rango. {horaPico ? `La hora más fuerte es la de las ${nombreHora(horaPico.hora)}.` : ""}
          </p>
          <div className="mt-3 space-y-1">
            {horas.map((h) => (
              <Barra key={h.hora} etiqueta={nombreHora(h.hora)} valor={h.pedidos} maximo={maxHora} detalle={`${h.pedidos} pedido(s) · ${formatoPesos(h.ventas)}`} />
            ))}
          </div>
        </section>
      ) : null}

      {reporte.porDia.length >= 7 ? (
        <section>
          <h2 className="text-sm font-bold">¿Qué días se vende más?</h2>
          <p className="text-xs text-muted-foreground">Venta promedio de cada día de la semana en el rango.</p>
          <div className="mt-3 space-y-1">
            {promedios.map((d) => (
              <Barra key={d.dia} etiqueta={d.nombre} valor={d.promedio} maximo={maxDia} detalle={formatoPesos(d.promedio)} />
            ))}
          </div>
        </section>
      ) : null}

      {r.mesasAtendidas > 0 ? (
        <section>
          <h2 className="text-sm font-bold">Rotación de mesas</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Grupos atendidos</p>
              <p className="mt-1 text-lg font-extrabold">{r.mesasAtendidas}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Tiempo promedio en la mesa</p>
              <p className="mt-1 text-lg font-extrabold">{duracion(r.duracionPromedioMin)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Personas por grupo</p>
              <p className="mt-1 text-lg font-extrabold">{r.comensalesPromedio ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Veces que se usa cada mesa al día</p>
              <p className="mt-1 text-lg font-extrabold">{r.vecesPorMesaAlDia ?? "—"}</p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-1.5 pr-4">Mesa</th>
                  <th className="py-1.5 pr-4">Grupos</th>
                  <th className="py-1.5 pr-4">Tiempo promedio</th>
                  <th className="py-1.5 text-right">Ventas</th>
                </tr>
              </thead>
              <tbody>
                {r.porMesa.map((m) => (
                  <tr key={m.mesa} className="border-b border-border/60">
                    <td className="py-1.5 pr-4">Mesa {m.mesa}</td>
                    <td className="py-1.5 pr-4">{m.veces}</td>
                    <td className="py-1.5 pr-4">{duracion(m.duracionPromedioMin)}</td>
                    <td className="py-1.5 text-right font-semibold">{formatoPesos(m.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
