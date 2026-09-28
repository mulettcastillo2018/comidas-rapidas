"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CampoPesos } from "@/components/CampoPesos";
import { METODO_PAGO_LABEL, METODOS_PAGO } from "@/lib/estados";
import { formatoPesos } from "@/lib/formato";
import type { MetodoPago } from "@/lib/types";

export interface PagoRegistrado {
  metodo: MetodoPago;
  monto: number;
}

// Lo que se le manda al servidor: un solo método, o la lista de pagos.
export type Cobro = { metodoPago: MetodoPago } | { pagos: PagoRegistrado[] };

interface Fila {
  metodo: MetodoPago;
  monto: number | null;
  etiqueta?: string;
}

// Cobro de una cuenta: con un solo método o dividido (parte en efectivo,
// parte por Nequi, cada comensal lo suyo...). Para el efectivo calcula las
// vueltas a partir de lo que entregó el cliente.
export function RegistroPagos({
  total,
  sugerenciasPorPersona,
  enviando,
  textoBoton,
  onCobrar,
}: {
  total: number;
  // Para "cada uno paga lo suyo": nombre y valor de cada comensal.
  sugerenciasPorPersona?: { nombre: string; monto: number }[];
  enviando: boolean;
  textoBoton: string;
  onCobrar: (cobro: Cobro) => void;
}) {
  const [dividido, setDividido] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [recibido, setRecibido] = useState<number | null>(null);

  const asignado = filas.reduce((s, f) => s + (f.monto ?? 0), 0);
  const falta = total - asignado;
  const enEfectivo = dividido ? filas.filter((f) => f.metodo === "EFECTIVO").reduce((s, f) => s + (f.monto ?? 0), 0) : metodo === "EFECTIVO" ? total : 0;
  const vueltas = recibido !== null ? recibido - enEfectivo : null;
  const filasValidas = filas.filter((f) => (f.monto ?? 0) > 0);
  const listo = !dividido || (filasValidas.length > 0 && falta === 0);

  function empezarDivision() {
    setDividido(true);
    setRecibido(null);
    setFilas([
      { metodo, monto: null },
      { metodo: metodo === "EFECTIVO" ? "NEQUI" : "EFECTIVO", monto: null },
    ]);
  }

  function cadaUnoLoSuyo() {
    setRecibido(null);
    setFilas((sugerenciasPorPersona ?? []).map((p) => ({ metodo: "EFECTIVO", monto: p.monto, etiqueta: p.nombre })));
  }

  function cambiarFila(i: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  }

  function cobrar() {
    if (!dividido) return onCobrar({ metodoPago: metodo });
    // Si todo terminó en un mismo método, se registra como un solo pago.
    const metodos = new Set(filasValidas.map((f) => f.metodo));
    if (metodos.size === 1) return onCobrar({ metodoPago: filasValidas[0].metodo });
    onCobrar({ pagos: filasValidas.map((f) => ({ metodo: f.metodo, monto: f.monto! })) });
  }

  return (
    <div className="space-y-2">
      {!dividido ? (
        <div className="flex flex-wrap items-center gap-2">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className="rounded-lg border border-border px-2 py-1.5 text-sm">
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {METODO_PAGO_LABEL[m]}
              </option>
            ))}
          </select>
          <button onClick={empezarDivision} className="text-xs font-semibold text-accent">
            Pagan con varios métodos o por separado
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Pago dividido</p>
            <div className="flex gap-3">
              {sugerenciasPorPersona && sugerenciasPorPersona.length > 1 ? (
                <button onClick={cadaUnoLoSuyo} className="text-xs font-semibold text-accent">
                  Cada uno paga lo suyo
                </button>
              ) : null}
              <button
                onClick={() => {
                  setDividido(false);
                  setFilas([]);
                  setRecibido(null);
                }}
                className="text-xs text-muted-foreground"
              >
                Un solo método
              </button>
            </div>
          </div>
          {filas.map((fila, i) => (
            <div key={i} className="flex items-center gap-2">
              {fila.etiqueta ? <span className="w-16 shrink-0 truncate text-xs font-semibold">{fila.etiqueta}</span> : null}
              <select
                value={fila.metodo}
                onChange={(e) => cambiarFila(i, { metodo: e.target.value as MetodoPago })}
                className="rounded-lg border border-border px-2 py-1 text-xs"
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {METODO_PAGO_LABEL[m]}
                  </option>
                ))}
              </select>
              <div className="min-w-0 flex-1">
                <CampoPesos compacto valor={fila.monto} onChange={(v) => cambiarFila(i, { monto: v })} />
              </div>
              {falta > 0 && !fila.monto ? (
                <button onClick={() => cambiarFila(i, { monto: falta })} className="shrink-0 text-[11px] font-semibold text-accent" title="Poner lo que falta">
                  Resto
                </button>
              ) : null}
              <button onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-muted-foreground hover:text-red-600" aria-label="Quitar pago">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <button onClick={() => setFilas((prev) => [...prev, { metodo: "EFECTIVO", monto: falta > 0 ? falta : null }])} className="flex items-center gap-1 font-semibold text-accent">
              <Plus size={12} /> Otro pago
            </button>
            <span className={falta === 0 ? "font-semibold text-green-700" : "font-semibold text-red-600"}>
              {falta === 0 ? "Cuadra con el total ✓" : falta > 0 ? `Falta ${formatoPesos(falta)}` : `Sobra ${formatoPesos(-falta)}`}
            </span>
          </div>
        </div>
      )}

      {enEfectivo > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">
          <span className="text-muted-foreground">El cliente entrega en efectivo:</span>
          <div className="w-32">
            <CampoPesos compacto valor={recibido} onChange={setRecibido} />
          </div>
          {vueltas !== null ? (
            vueltas >= 0 ? (
              <span className="text-sm font-bold">Vueltas: {formatoPesos(vueltas)}</span>
            ) : (
              <span className="font-semibold text-red-600">Faltan {formatoPesos(-vueltas)} en efectivo</span>
            )
          ) : null}
        </div>
      ) : null}

      <button
        onClick={cobrar}
        disabled={enviando || !listo || (vueltas !== null && vueltas < 0)}
        className="btn-primary w-full rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enviando ? "Guardando…" : textoBoton}
      </button>
    </div>
  );
}
