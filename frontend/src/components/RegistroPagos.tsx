"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Boton, cx, Insignia, Selector } from "@/components/ui";
import { CampoPesos } from "@/components/CampoPesos";
import { METODO_PAGO_LABEL, METODOS_PAGO } from "@/lib/estados";
import { formatoPesos } from "@/lib/formato";
import { apiFetch } from "@/lib/api";
import { problemaAdquiriente, type Adquiriente } from "@/lib/facturacion";
import { useAuthStore } from "@/store/auth.store";
import { ADQUIRIENTE_VACIO, DatosFacturacion } from "@/components/DatosFacturacion";
import { ClienteFrecuente } from "@/components/ClienteFrecuente";
import type { ClienteDeCuenta } from "@/lib/clientes";
import type { MetodoPago } from "@/lib/types";

export interface PagoRegistrado {
  metodo: MetodoPago;
  monto: number;
}

// Lo que se le manda al servidor: un solo método, o la lista de pagos; y los
// datos del cliente si pidió la factura electrónica a su nombre.
export type Cobro = ({ metodoPago: MetodoPago } | { pagos: PagoRegistrado[] }) & { adquiriente?: Adquiriente; clienteId?: string };

// Una sola consulta por pestaña: si la facturación electrónica está activa.
let facturacionActiva: Promise<boolean> | null = null;
function consultarFacturacionActiva(token: string) {
  facturacionActiva ??= apiFetch<{ activa: boolean }>("/facturacion/activa", { token })
    .then((r) => r.activa)
    .catch(() => {
      facturacionActiva = null;
      return false;
    });
  return facturacionActiva;
}

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
  conCliente,
}: {
  // Ofrecer identificar al cliente frecuente para que acumule puntos.
  conCliente?: boolean;
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
  const token = useAuthStore((state) => state.token);
  const [conFactura, setConFactura] = useState(false);
  const [pideFactura, setPideFactura] = useState(false);
  const [adquiriente, setAdquiriente] = useState<Adquiriente>(ADQUIRIENTE_VACIO);
  const problemaFactura = pideFactura ? problemaAdquiriente(adquiriente) : null;
  const [cliente, setCliente] = useState<ClienteDeCuenta | null>(null);

  useEffect(() => {
    if (token) consultarFacturacionActiva(token).then(setConFactura);
  }, [token]);

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
    const factura = {
      ...(pideFactura ? { adquiriente: { ...adquiriente, nombre: adquiriente.nombre.trim(), email: adquiriente.email || null } } : {}),
      ...(cliente ? { clienteId: cliente.clienteId } : {}),
    };
    if (!dividido) return onCobrar({ metodoPago: metodo, ...factura });
    // Si todo terminó en un mismo método, se registra como un solo pago.
    const metodos = new Set(filasValidas.map((f) => f.metodo));
    if (metodos.size === 1) return onCobrar({ metodoPago: filasValidas[0].metodo, ...factura });
    onCobrar({ pagos: filasValidas.map((f) => ({ metodo: f.metodo, monto: f.monto! })), ...factura });
  }

  return (
    <div className="space-y-3">
      {!dividido ? (
        <div className="flex flex-wrap items-center gap-2">
          <Selector value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} contenedor="min-w-44 flex-1" aria-label="Método de pago">
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {METODO_PAGO_LABEL[m]}
              </option>
            ))}
          </Selector>
          <Boton variante="fantasma" tamano="sm" className="text-accent hover:text-accent" onClick={empezarDivision}>
            Pagan con varios métodos o por separado
          </Boton>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-2xl border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Pago dividido</p>
            <div className="flex gap-3">
              {sugerenciasPorPersona && sugerenciasPorPersona.length > 1 ? (
                <button onClick={cadaUnoLoSuyo} className="rounded-lg px-1.5 py-0.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10">
                  Cada uno paga lo suyo
                </button>
              ) : null}
              <button
                onClick={() => {
                  setDividido(false);
                  setFilas([]);
                  setRecibido(null);
                }}
                className="rounded-lg px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Un solo método
              </button>
            </div>
          </div>
          {filas.map((fila, i) => (
            <div key={i} className="flex items-center gap-2">
              {fila.etiqueta ? <span className="w-16 shrink-0 truncate text-xs font-semibold">{fila.etiqueta}</span> : null}
              <Selector tamano="sm" value={fila.metodo} onChange={(e) => cambiarFila(i, { metodo: e.target.value as MetodoPago })} aria-label="Método">
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {METODO_PAGO_LABEL[m]}
                  </option>
                ))}
              </Selector>
              <div className="min-w-0 flex-1">
                <CampoPesos compacto valor={fila.monto} onChange={(v) => cambiarFila(i, { monto: v })} />
              </div>
              {falta > 0 && !fila.monto ? (
                <button
                  onClick={() => cambiarFila(i, { monto: falta })}
                  className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/15"
                  title="Poner lo que falta"
                >
                  Resto
                </button>
              ) : null}
              <button
                onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-peligro/10 hover:text-peligro"
                aria-label="Quitar pago"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              onClick={() => setFilas((prev) => [...prev, { metodo: "EFECTIVO", monto: falta > 0 ? falta : null }])}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              <Plus className="size-3.5" /> Otro pago
            </button>
            <Insignia tono={falta === 0 ? "exito" : "peligro"} className="tabular-nums">
              {falta === 0 ? (
                <>
                  <Check aria-hidden /> Cuadra con el total
                </>
              ) : falta > 0 ? (
                `Falta ${formatoPesos(falta)}`
              ) : (
                `Sobra ${formatoPesos(-falta)}`
              )}
            </Insignia>
          </div>
        </div>
      )}

      {enEfectivo > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-2/70 p-3 text-xs ring-1 ring-border ring-inset">
          <span className="text-muted-foreground">El cliente entrega en efectivo:</span>
          <div className="w-36">
            <CampoPesos compacto valor={recibido} onChange={setRecibido} />
          </div>
          {vueltas !== null ? (
            vueltas >= 0 ? (
              <span className="text-sm font-semibold tabular-nums">
                Vueltas: <span className="text-base">{formatoPesos(vueltas)}</span>
              </span>
            ) : (
              <span className="font-semibold text-peligro tabular-nums">Faltan {formatoPesos(-vueltas)} en efectivo</span>
            )
          ) : null}
        </div>
      ) : null}

      {conCliente ? <ClienteFrecuente onCambio={setCliente} /> : null}

      {conFactura ? (
        <div className="space-y-2.5 rounded-2xl border border-dashed border-border-strong p-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input type="checkbox" checked={pideFactura} onChange={(e) => setPideFactura(e.target.checked)} className="size-4 accent-accent" />
            El cliente pide la factura electrónica a su nombre
          </label>
          {pideFactura ? (
            <>
              <DatosFacturacion valor={adquiriente} onCambio={setAdquiriente} />
              {problemaFactura ? <p className="font-medium text-aviso">{problemaFactura}</p> : null}
            </>
          ) : (
            <p className="text-muted-foreground">Si no, se emite a consumidor final.</p>
          )}
        </div>
      ) : null}

      <Boton bloque tamano="lg" onClick={cobrar} cargando={enviando} disabled={!listo || (vueltas !== null && vueltas < 0) || Boolean(problemaFactura)}>
        {enviando ? "Guardando…" : textoBoton}
      </Boton>
    </div>
  );
}
