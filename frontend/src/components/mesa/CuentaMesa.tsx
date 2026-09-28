"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { METODO_PAGO_LABEL } from "@/lib/estados";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import QRCode from "qrcode";
import { useImpresion, ZonaImpresion } from "@/lib/impresion";
import { urlPublica } from "@/lib/urlPublica";
import { calcularPrecuenta, PORCENTAJE_PROPINA_SUGERIDA, propinaSugerida, type Precuenta } from "@/lib/precuenta";
import type { MesaSesion, MetodoPago } from "@/lib/types";

const AVISO_LEGAL = "Precuenta — no es factura electrónica de venta.";
const AVISO_PROPINA = `Propina sugerida del ${PORCENTAJE_PROPINA_SUGERIDA}%: es voluntaria, el cliente decide si la paga.`;

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? "text-base font-bold" : ""}`}>
      <span className={fuerte ? "" : "text-muted-foreground"}>{label}</span>
      <span>{formatoPesos(valor)}</span>
    </div>
  );
}

function PorPersona({ precuenta }: { precuenta: Precuenta }) {
  if (precuenta.porPersona.length < 2) return null;
  return (
    <details className="rounded-lg bg-muted/60 p-2 text-xs">
      <summary className="cursor-pointer font-semibold">¿Van a pagar por separado? Ver cuánto le toca a cada uno</summary>
      <div className="mt-2 space-y-1.5">
        {precuenta.porPersona.map((p) => (
          <div key={p.comensal.id} className="flex items-start justify-between gap-2">
            <span>
              <strong>{p.comensal.nombre}</strong>
              <span className="block text-muted-foreground">
                lo suyo {formatoPesos(p.propios)}
                {p.compartido > 0 ? ` + compartido ${formatoPesos(p.compartido)}` : ""}
                {p.propina > 0 ? ` + propina ${formatoPesos(p.propina)}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-semibold">{formatoPesos(p.total)}</span>
          </div>
        ))}
        {precuenta.totalCompartido > 0 ? (
          <p className="text-muted-foreground">
            Lo compartido y para llevar ({formatoPesos(precuenta.totalCompartido)}) y la propina se reparten por partes iguales.
          </p>
        ) : null}
      </div>
    </details>
  );
}

// Lo que se imprime: la precuenta para entregar en la mesa, con un QR para
// que el cliente califique la atención.
function PrecuentaImpresa({ sesion, precuenta, qrEncuesta }: { sesion: MesaSesion; precuenta: Precuenta; qrEncuesta: string | null }) {
  const lineas = new Map<string, { nombre: string; cantidad: number; valor: number }>();
  for (const item of precuenta.items) {
    const clave = `${item.productoId}-${item.precioUnitario}`;
    const linea = lineas.get(clave) ?? { nombre: item.producto?.nombre ?? "Producto", cantidad: 0, valor: 0 };
    linea.cantidad += item.cantidad;
    linea.valor += item.cantidad * item.precioUnitario;
    lineas.set(clave, linea);
  }
  return (
    <div className="mx-auto max-w-xs text-sm">
      <p className="text-center text-base font-bold">Comidas Rápidas</p>
      <p className="text-center text-xs">
        Mesa {sesion.mesa?.numero} · {formatoFechaHora(new Date().toISOString())}
      </p>
      <div className="mt-3 space-y-0.5 border-y border-dashed border-foreground py-2">
        {Array.from(lineas.values()).map((l) => (
          <div key={l.nombre} className="flex justify-between gap-2">
            <span>
              {l.cantidad}× {l.nombre}
            </span>
            <span>{formatoPesos(l.valor)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        <Fila label="Subtotal" valor={precuenta.subtotal} />
        {precuenta.propina > 0 ? <Fila label={`Propina sugerida (${PORCENTAJE_PROPINA_SUGERIDA}%)`} valor={precuenta.propina} /> : null}
        <Fila label="Total" valor={precuenta.total} fuerte />
      </div>
      {precuenta.porPersona.length > 1 ? (
        <div className="mt-3 space-y-0.5 border-t border-dashed border-foreground pt-2 text-xs">
          <p className="font-semibold">Por persona (sugerido)</p>
          {precuenta.porPersona.map((p) => (
            <div key={p.comensal.id} className="flex justify-between">
              <span>{p.comensal.nombre}</span>
              <span>{formatoPesos(p.total)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {precuenta.propina > 0 ? <p className="mt-3 text-center text-[11px]">{AVISO_PROPINA}</p> : null}
      <p className="mt-1 text-center text-[11px]">{AVISO_LEGAL}</p>
      {qrEncuesta ? (
        <div className="mt-4 flex flex-col items-center gap-1 border-t border-dashed border-foreground pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrEncuesta} alt="" className="h-28 w-28" />
          <p className="text-center text-[11px]">¿Cómo te atendimos? Escanea y califícanos.</p>
        </div>
      ) : null}
    </div>
  );
}

export function CuentaMesa({
  sesion,
  productosSinEntregar,
  generando,
  pagando,
  onGenerar,
  onPagar,
  onPerdida,
}: {
  sesion: MesaSesion;
  productosSinEntregar: number;
  generando: boolean;
  pagando: boolean;
  onGenerar: (propina: number) => void;
  onPagar: (metodo: MetodoPago) => void;
  onPerdida: () => void;
}) {
  const factura = sesion.factura;
  const subtotalActual = calcularPrecuenta(sesion, 0).subtotal;
  const sugerida = propinaSugerida(subtotalActual);
  const [propina, setPropina] = useState(0);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [imprimiendo, setImprimiendo] = useImpresion<{ qrEncuesta: string | null }>();
  const precuenta = calcularPrecuenta(sesion, factura ? factura.propinaMonto : propina);

  const hayPedidos = (sesion.pedidos?.length ?? 0) > 0;

  async function imprimir() {
    const qrEncuesta = sesion.codigoEncuesta
      ? await QRCode.toDataURL(`${urlPublica()}/encuesta/${sesion.codigoEncuesta}`, { width: 240, margin: 1 }).catch(() => null)
      : null;
    setImprimiendo({ qrEncuesta });
  }

  return (
    <>
      {imprimiendo ? (
        <ZonaImpresion>
          <PrecuentaImpresa sesion={sesion} precuenta={precuenta} qrEncuesta={imprimiendo.qrEncuesta} />
        </ZonaImpresion>
      ) : null}

      <section className="mt-6 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Cuenta</h2>
          {hayPedidos ? (
            <button onClick={imprimir} className="flex items-center gap-1 text-xs font-semibold text-accent">
              <Printer size={14} /> Imprimir precuenta
            </button>
          ) : null}
        </div>

        {!hayPedidos ? (
          <p className="mt-2 text-sm text-muted-foreground">Envía al menos un pedido antes de poder generar la cuenta.</p>
        ) : factura ? (
          <div className="mt-3 space-y-2 text-sm">
            <Fila label="Subtotal" valor={factura.subtotal} />
            {factura.propinaMonto > 0 ? <Fila label="Propina (voluntaria)" valor={factura.propinaMonto} /> : null}
            <Fila label="Total" valor={factura.total} fuerte />
            <PorPersona precuenta={precuenta} />
            <p className="text-[11px] text-muted-foreground">{AVISO_LEGAL}</p>

            {factura.estado === "PAGADA" ? (
              <p className="mt-2 text-center text-sm font-semibold text-accent">
                Cuenta pagada{factura.metodoPago ? ` (${METODO_PAGO_LABEL[factura.metodoPago]})` : ""}
              </p>
            ) : factura.estado === "PERDIDA" ? (
              <p className="mt-2 text-center text-sm font-semibold text-red-600">Cuenta registrada como pérdida</p>
            ) : (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                    className="rounded-lg border border-border px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
                      <option key={m} value={m}>
                        {METODO_PAGO_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onPagar(metodoPago)}
                    disabled={pagando}
                    className="btn-primary flex-1 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pagando ? "Guardando…" : "Marcar como pagada y cerrar mesa"}
                  </button>
                </div>
                <button
                  onClick={onPerdida}
                  disabled={pagando}
                  className="w-full rounded-full border border-red-600 px-4 py-1.5 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cliente se fue sin pagar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <Fila label="Consumo hasta ahora" valor={subtotalActual} />
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Propina — pregúntale al cliente si desea incluirla</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPropina(0)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${propina === 0 ? "btn-primary" : "bg-muted text-muted-foreground"}`}
                >
                  Sin propina
                </button>
                <button
                  onClick={() => setPropina(sugerida)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${propina === sugerida && sugerida > 0 ? "btn-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {PORCENTAJE_PROPINA_SUGERIDA}% sugerida ({formatoPesos(sugerida)})
                </button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Otra:
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={propina}
                    onChange={(e) => setPropina(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    className="w-24 rounded-lg border border-border px-2 py-1"
                  />
                </label>
              </div>
            </div>
            <Fila label="Total a cobrar" valor={subtotalActual + propina} fuerte />
            <PorPersona precuenta={precuenta} />
            <button
              onClick={() => onGenerar(propina)}
              disabled={generando || productosSinEntregar > 0}
              className="btn-primary w-full rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generando ? "Generando…" : "Generar cuenta"}
            </button>
            {productosSinEntregar > 0 ? (
              <p className="text-xs text-muted-foreground">
                Hay {productosSinEntregar} producto(s) sin entregar. Entrégalos o cancélalos para poder generar la cuenta.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
