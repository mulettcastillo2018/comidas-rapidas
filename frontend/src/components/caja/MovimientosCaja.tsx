"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { nombreCompleto } from "@/lib/nombre";
import { CampoPesos } from "@/components/CampoPesos";
import type { MovimientoCaja } from "@/lib/types";

const ETIQUETA = { ENTRADA: "Entrada", SALIDA: "Salida", ENTREGA_MESERO: "Entrega de mesero" } as const;

// Plata que entra o sale de la caja sin ser una venta: si se le paga al
// proveedor con plata de la caja y no se anota, el cierre muestra un
// faltante que no es real.
export function MovimientosCaja({ token, movimientos, onCambio }: { token: string; movimientos: MovimientoCaja[]; onCambio: () => void }) {
  const [tipo, setTipo] = useState<"SALIDA" | "ENTRADA">("SALIDA");
  const [monto, setMonto] = useState<number | null>(null);
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar(event: FormEvent) {
    event.preventDefault();
    if (!monto) return;
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/caja/movimientos", { method: "POST", token, body: JSON.stringify({ tipo, monto, concepto: concepto.trim() }) });
      setMonto(null);
      setConcepto("");
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(m: MovimientoCaja) {
    if (!confirm(`¿Borrar "${m.concepto}" por ${formatoPesos(m.monto)}? Úsalo solo para corregir un error.`)) return;
    try {
      await apiFetch(`/caja/movimientos/${m.id}`, { method: "DELETE", token });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar el movimiento.");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">Entradas y salidas de efectivo</h2>
        <p className="text-xs text-muted-foreground">
          Lo que sale de la caja sin ser una venta (pago a un proveedor, un retiro) o lo que entra además de las ventas
          (más base). Así el cierre cuadra.
        </p>
      </div>
      <form onSubmit={registrar} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3 text-sm">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "SALIDA" | "ENTRADA")} className="rounded-lg border border-border px-2 py-2">
          <option value="SALIDA">Salida</option>
          <option value="ENTRADA">Entrada</option>
        </select>
        <div className="w-36">
          <CampoPesos valor={monto} onChange={setMonto} />
        </div>
        <input
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={tipo === "SALIDA" ? "Concepto (ej. pago del pan)" : "Concepto (ej. más base)"}
          maxLength={200}
          className="min-w-40 flex-1 rounded-lg border border-border px-2 py-2"
        />
        <button type="submit" disabled={guardando || !monto || !concepto.trim()} className="btn-primary rounded-full px-4 py-2 text-xs disabled:opacity-50">
          Registrar
        </button>
      </form>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {movimientos.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {movimientos.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">
                  <span className="text-xs font-semibold text-muted-foreground">{ETIQUETA[m.tipo]}</span> ·{" "}
                  {m.tipo === "ENTREGA_MESERO" ? nombreCompleto(m.mesero) : m.concepto}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatoFechaHora(m.creadoEn)} · registró {nombreCompleto(m.registradoPor)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`font-semibold ${m.tipo === "SALIDA" ? "text-red-600" : "text-green-700"}`}>
                  {m.tipo === "SALIDA" ? "−" : "+"}
                  {formatoPesos(m.monto)}
                </span>
                <button onClick={() => borrar(m)} title="Borrar (solo para corregir errores)" className="text-muted-foreground hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
