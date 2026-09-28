"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import type { CajaActual, CierreCaja } from "@/lib/types";

const miles = new Intl.NumberFormat("es-CO");

// Solo dígitos: "150.000", "150000" y "$150.000" valen lo mismo.
function CampoPesos({ label, valor, onChange, ayuda }: { label: string; valor: number | null; onChange: (v: number | null) => void; ayuda?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      {ayuda ? <span className="block text-xs text-muted-foreground">{ayuda}</span> : null}
      <div className="mt-1 flex items-center rounded-lg border border-border px-2">
        <span className="text-muted-foreground">$</span>
        <input
          inputMode="numeric"
          value={valor === null ? "" : miles.format(valor)}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "");
            onChange(digitos === "" ? null : Number(digitos));
          }}
          placeholder="0"
          className="w-full bg-transparent px-1 py-2 outline-none"
        />
      </div>
    </label>
  );
}

function Diferencia({ valor, grande }: { valor: number; grande?: boolean }) {
  const clase = grande ? "text-lg font-extrabold" : "font-semibold";
  if (valor === 0) return <span className={`${clase} text-green-700`}>Cuadra</span>;
  if (valor < 0) return <span className={`${clase} text-red-600`}>Faltan {formatoPesos(-valor)}</span>;
  return <span className={`${clase} text-amber-600`}>Sobran {formatoPesos(valor)}</span>;
}

function Comprobante({ cierre }: { cierre: CierreCaja }) {
  const fila = (label: string, valor: string) => (
    <div className="flex justify-between border-b border-dashed border-border py-1">
      <span>{label}</span>
      <span className="font-semibold">{valor}</span>
    </div>
  );
  return (
    <div className="mx-auto max-w-sm text-sm">
      <p className="text-center text-base font-bold">Cierre de caja</p>
      <p className="text-center text-xs">
        {formatoFechaHora(cierre.desde)} → {formatoFechaHora(cierre.hasta)}
      </p>
      <p className="mb-3 text-center text-xs">Cerró: {nombreCompleto(cierre.cerradoPor)}</p>
      {fila("Cuentas cobradas", String(cierre.cuentasPagadas))}
      {fila("Efectivo", formatoPesos(cierre.totalEfectivo))}
      {fila("Tarjeta", formatoPesos(cierre.totalTarjeta))}
      {fila("Otro", formatoPesos(cierre.totalOtro))}
      {fila("Total cobrado", formatoPesos(cierre.totalEfectivo + cierre.totalTarjeta + cierre.totalOtro))}
      {fila("Propinas (incluidas)", formatoPesos(cierre.propinas))}
      {fila("Se fueron sin pagar", `${cierre.cuentasPerdidas} · ${formatoPesos(cierre.totalPerdidas)}`)}
      {fila("Base inicial", formatoPesos(cierre.baseInicial))}
      {fila("Efectivo esperado", formatoPesos(cierre.baseInicial + cierre.totalEfectivo))}
      {fila("Efectivo contado", formatoPesos(cierre.efectivoContado))}
      <div className="flex justify-between py-2">
        <span>Diferencia</span>
        <Diferencia valor={cierre.diferencia} />
      </div>
      {cierre.notas ? <p className="mt-2 text-xs">Notas: {cierre.notas}</p> : null}
      <p className="mt-8 border-t border-foreground pt-1 text-center text-xs">Firma</p>
    </div>
  );
}

export default function AdminCajaPage() {
  const token = useAuthStore((state) => state.token);
  const [actual, setActual] = useState<CajaActual | null>(null);
  const [historial, setHistorial] = useState<CierreCaja[]>([]);
  const [baseInicial, setBaseInicial] = useState<number | null>(null);
  const [efectivoContado, setEfectivoContado] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recienCerrado, setRecienCerrado] = useState<CierreCaja | null>(null);
  const [imprimiendo, setImprimiendo] = useState<CierreCaja | null>(null);

  async function cargar() {
    if (!token) return;
    const [actualData, historialData] = await Promise.all([
      apiFetch<CajaActual>("/caja/actual", { token }),
      apiFetch<CierreCaja[]>("/caja/cierres", { token }),
    ]);
    setActual(actualData);
    setHistorial(historialData);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!imprimiendo) return;
    const quitar = () => setImprimiendo(null);
    window.addEventListener("afterprint", quitar);
    window.print();
    return () => window.removeEventListener("afterprint", quitar);
  }, [imprimiendo]);

  const hayMovimientos = Boolean(actual && actual.cuentasPagadas + actual.cuentasPerdidas > 0);
  const esperado = actual ? (baseInicial ?? 0) + actual.totalEfectivo : 0;

  async function handleCerrar(event: FormEvent) {
    event.preventDefault();
    if (!token || !actual || efectivoContado === null) return;
    const diferencia = efectivoContado - esperado;
    const aviso =
      diferencia === 0
        ? "La caja cuadra."
        : diferencia < 0
          ? `Faltan ${formatoPesos(-diferencia)} en caja.`
          : `Sobran ${formatoPesos(diferencia)} en caja.`;
    if (!confirm(`¿Cerrar caja?\n\n${aviso}\n\nUna vez cerrada no se puede editar.`)) return;

    setGuardando(true);
    setError(null);
    try {
      const cierre = await apiFetch<CierreCaja>("/caja/cierres", {
        method: "POST",
        token,
        body: JSON.stringify({ baseInicial: baseInicial ?? 0, efectivoContado, notas: notas.trim() || null }),
      });
      setRecienCerrado(cierre);
      setBaseInicial(null);
      setEfectivoContado(null);
      setNotas("");
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar la caja.");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (!actual) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <>
      {imprimiendo ? (
        <div className="hidden print:block">
          <Comprobante cierre={imprimiendo} />
        </div>
      ) : null}

      <div className={`space-y-8 ${imprimiendo ? "print:hidden" : ""}`}>
        <p className="text-sm text-muted-foreground">
          Al terminar el turno, cuenta el efectivo que hay en la caja y escríbelo aquí: el sistema lo compara con lo
          cobrado en efectivo desde el último cierre y te dice si cuadra.
        </p>

        {recienCerrado ? (
          <div className="rounded-xl border border-green-600 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">
              Caja cerrada. <Diferencia valor={recienCerrado.diferencia} />
            </p>
            <button onClick={() => setImprimiendo(recienCerrado)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold underline">
              <Printer size={14} /> Imprimir comprobante
            </button>
          </div>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-bold">
            Turno actual <span className="font-normal text-muted-foreground">— desde {formatoFechaHora(actual.desde)}</span>
          </h2>

          {actual.mesasAbiertas > 0 || actual.cuentasPorCobrar > 0 ? (
            <div className="flex gap-2 rounded-xl border border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              <p>
                {actual.mesasAbiertas > 0 ? `Hay ${actual.mesasAbiertas} mesa(s) abierta(s). ` : ""}
                {actual.cuentasPorCobrar > 0 ? `Hay ${actual.cuentasPorCobrar} cuenta(s) generada(s) sin cobrar. ` : ""}
                Puedes cerrar igual: lo que se cobre después entra en el siguiente cierre.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Efectivo", actual.totalEfectivo],
              ["Tarjeta", actual.totalTarjeta],
              ["Otro", actual.totalOtro],
              ["Total cobrado", actual.totalEfectivo + actual.totalTarjeta + actual.totalOtro],
            ].map(([label, valor]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-extrabold">{formatoPesos(valor as number)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {actual.cuentasPagadas} cuenta(s) cobrada(s) · propinas incluidas: {formatoPesos(actual.propinas)}
            {actual.cuentasPerdidas > 0 ? (
              <span className="text-red-600">
                {" "}
                · {actual.cuentasPerdidas} se fue(ron) sin pagar ({formatoPesos(actual.totalPerdidas)})
              </span>
            ) : null}
          </p>

          {hayMovimientos ? (
            <form onSubmit={handleCerrar} className="space-y-4 rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoPesos label="Base inicial" ayuda="Efectivo con el que arrancó la caja (para vueltas)" valor={baseInicial} onChange={setBaseInicial} />
                <CampoPesos label="Efectivo contado" ayuda="Todo el efectivo que hay ahora en la caja" valor={efectivoContado} onChange={setEfectivoContado} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
                <span>
                  Efectivo esperado: <strong>{formatoPesos(esperado)}</strong>
                </span>
                {efectivoContado !== null ? <Diferencia valor={efectivoContado - esperado} grande /> : null}
              </div>
              <label className="block text-sm">
                <span className="font-semibold">Notas</span>
                <span className="block text-xs text-muted-foreground">Opcional — útil para explicar un descuadre</span>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5"
                />
              </label>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button type="submit" disabled={guardando || efectivoContado === null} className="btn-primary rounded-full px-5 py-2 text-sm disabled:opacity-50">
                {guardando ? "Cerrando…" : "Cerrar caja"}
              </button>
            </form>
          ) : (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No hay cuentas cobradas desde el último cierre.</p>
          )}
        </section>

        {historial.length > 0 ? (
          <section>
            <h2 className="text-sm font-bold">Cierres anteriores</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-1.5 pr-4">Cierre</th>
                    <th className="py-1.5 pr-4">Cerró</th>
                    <th className="py-1.5 pr-4 text-right">Total cobrado</th>
                    <th className="py-1.5 pr-4 text-right">Efectivo esperado</th>
                    <th className="py-1.5 pr-4 text-right">Contado</th>
                    <th className="py-1.5 pr-4">Diferencia</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {historial.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 align-top">
                      <td className="py-1.5 pr-4 text-xs">
                        {formatoFechaHora(c.hasta)}
                        {c.notas ? <p className="mt-0.5 max-w-48 text-muted-foreground">{c.notas}</p> : null}
                      </td>
                      <td className="py-1.5 pr-4">{nombreCompleto(c.cerradoPor)}</td>
                      <td className="py-1.5 pr-4 text-right">{formatoPesos(c.totalEfectivo + c.totalTarjeta + c.totalOtro)}</td>
                      <td className="py-1.5 pr-4 text-right">{formatoPesos(c.baseInicial + c.totalEfectivo)}</td>
                      <td className="py-1.5 pr-4 text-right">{formatoPesos(c.efectivoContado)}</td>
                      <td className="py-1.5 pr-4">
                        <Diferencia valor={c.diferencia} />
                      </td>
                      <td className="py-1.5">
                        <button onClick={() => setImprimiendo(c)} title="Imprimir comprobante" className="text-muted-foreground hover:text-accent">
                          <Printer size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
