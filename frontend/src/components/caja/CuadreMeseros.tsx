"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import { CampoPesos } from "@/components/CampoPesos";
import type { CuadreMesero } from "@/lib/types";

// Si los meseros cobran en la mesa y guardan el efectivo hasta entregarlo,
// aquí se ve cuánto cobró cada uno y cuánto ha entregado a la caja.
export function CuadreMeseros({ token, cuadre, onCambio }: { token: string; cuadre: CuadreMesero[]; onCambio: () => void }) {
  const [entregando, setEntregando] = useState<{ userId: string; monto: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (cuadre.length === 0) return null;

  async function registrarEntrega() {
    if (!entregando?.monto) return;
    setError(null);
    try {
      await apiFetch("/caja/movimientos", {
        method: "POST",
        token,
        body: JSON.stringify({ tipo: "ENTREGA_MESERO", monto: entregando.monto, meseroId: entregando.userId }),
      });
      setEntregando(null);
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la entrega.");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">Efectivo cobrado por los meseros</h2>
        <p className="text-xs text-muted-foreground">
          Lo que cada mesero cobró en efectivo en sus mesas y lo que ya entregó a la caja. Registra la entrega cuando te
          traiga la plata.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-1.5 pr-4">Mesero</th>
              <th className="py-1.5 pr-4 text-right">Cobró</th>
              <th className="py-1.5 pr-4 text-right">Entregó</th>
              <th className="py-1.5 pr-4 text-right">Pendiente</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {cuadre.map((m) => (
              <tr key={m.userId} className="border-b border-border/60 align-middle">
                <td className="py-1.5 pr-4">{m.nombre}</td>
                <td className="py-1.5 pr-4 text-right">{formatoPesos(m.cobrado)}</td>
                <td className="py-1.5 pr-4 text-right">{formatoPesos(m.entregado)}</td>
                <td className={`py-1.5 pr-4 text-right font-semibold ${m.pendiente > 0 ? "text-amber-600" : m.pendiente < 0 ? "text-red-600" : "text-green-700"}`}>
                  {m.pendiente === 0 ? "Al día" : formatoPesos(m.pendiente)}
                </td>
                <td className="py-1.5 text-right">
                  {entregando?.userId === m.userId ? (
                    <span className="flex items-center justify-end gap-1">
                      <span className="w-28">
                        <CampoPesos compacto valor={entregando.monto} onChange={(monto) => setEntregando({ userId: m.userId, monto })} />
                      </span>
                      <button onClick={registrarEntrega} disabled={!entregando.monto} className="btn-primary rounded-full px-3 py-1 text-xs disabled:opacity-50">
                        Guardar
                      </button>
                      <button onClick={() => setEntregando(null)} className="text-xs text-muted-foreground">
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setEntregando({ userId: m.userId, monto: m.pendiente > 0 ? m.pendiente : null })}
                      className="text-xs font-semibold text-accent"
                    >
                      Registrar entrega
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
