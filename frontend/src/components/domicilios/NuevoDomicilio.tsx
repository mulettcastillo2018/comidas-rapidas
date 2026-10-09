"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import { METODO_PAGO_LABEL, METODOS_PAGO } from "@/lib/estados";
import { CampoPesos } from "@/components/CampoPesos";
import { NuevoPedido, type ItemBorrador } from "@/components/mesa/NuevoPedido";
import type { MetodoPago, Pedido, Plataforma, Producto } from "@/lib/types";

// Valor del domicilio que se propone por defecto (se puede cambiar en cada
// pedido según la distancia).
const ENVIO_SUGERIDO = 4000;

// Pedido que llega por teléfono/WhatsApp (domicilio con mensajero propio) o
// por una app (Rappi, DiDi...). Va directo a cocina.
export function NuevoDomicilio({
  token,
  productos,
  plataformas,
  onCreado,
}: {
  token: string;
  productos: Producto[];
  plataformas: Plataforma[];
  onCreado: (pedido: Pedido) => void;
}) {
  const [canal, setCanal] = useState<"DOMICILIO" | "PLATAFORMA">("DOMICILIO");
  const [plataformaId, setPlataformaId] = useState("");
  const [codigoPlataforma, setCodigoPlataforma] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [barrio, setBarrio] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [envio, setEnvio] = useState<number | null>(ENVIO_SUGERIDO);
  const [yaPago, setYaPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("NEQUI");
  const [pagaCon, setPagaCon] = useState<number | null>(null);
  const [aceptaDatos, setAceptaDatos] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Para que el borrador de productos arranque vacío después de registrar.
  const [version, setVersion] = useState(0);

  const activas = plataformas.filter((p) => p.activa);
  const plataforma = activas.find((p) => p.id === plataformaId);
  const esDomicilio = canal === "DOMICILIO";
  const total = subtotal + (esDomicilio ? (envio ?? 0) : 0);
  const vueltas = esDomicilio && !yaPago && pagaCon !== null ? pagaCon - total : null;

  function validar(): string | null {
    if (esDomicilio) {
      if (!nombre.trim() || !telefono.trim()) return "Escribe el nombre y el teléfono del cliente.";
      if (!direccion.trim()) return "Escribe la dirección de entrega.";
      if (!aceptaDatos) return "Confirma que el cliente autorizó usar sus datos para la entrega.";
    } else if (!plataforma) {
      return "Elige la app por la que llegó el pedido.";
    }
    return null;
  }

  async function registrar(items: ItemBorrador[]): Promise<boolean> {
    const problema = validar();
    if (problema) {
      setError(problema);
      return false;
    }
    setError(null);
    setEnviando(true);
    try {
      const pedido = await apiFetch<Pedido>("/domicilios", {
        method: "POST",
        token,
        body: JSON.stringify({
          canal,
          nombreCliente: nombre.trim() || null,
          telefonoCliente: telefono.trim() || null,
          ...(esDomicilio
            ? {
                direccion: direccion.trim(),
                barrio: barrio.trim() || null,
                indicaciones: indicaciones.trim() || null,
                envio: envio ?? 0,
                aceptaDatos,
                ...(yaPago ? { metodoPago } : { pagaCon }),
              }
            : { plataformaId, codigoPlataforma: codigoPlataforma.trim() || null }),
          items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad, notas: i.notas || null, adicionIds: i.adicionIds })),
        }),
      });
      onCreado(pedido);
      setNombre("");
      setTelefono("");
      setDireccion("");
      setBarrio("");
      setIndicaciones("");
      setCodigoPlataforma("");
      setPagaCon(null);
      setYaPago(false);
      setAceptaDatos(false);
      setEnvio(ENVIO_SUGERIDO);
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pedido.");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4 bg-surface shadow-suave">
      <div className="flex flex-wrap gap-2">
        {(["DOMICILIO", "PLATAFORMA"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCanal(c)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${canal === c ? "btn-primary" : "bg-muted text-muted-foreground"}`}
          >
            {c === "DOMICILIO" ? "🛵 Domicilio propio" : "📱 Pedido de una app"}
          </button>
        ))}
      </div>

      {esDomicilio ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" className="rounded-xl border border-border px-3 py-2 text-sm" />
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" inputMode="tel" className="rounded-xl border border-border px-3 py-2 text-sm" />
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (ej. Cra 45 # 12-30 apto 201)" className="rounded-xl border border-border px-3 py-2 text-sm sm:col-span-2" />
          <input value={barrio} onChange={(e) => setBarrio(e.target.value)} placeholder="Barrio (opcional)" className="rounded-xl border border-border px-3 py-2 text-sm" />
          <input value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Indicaciones (portería, casa esquinera...)" className="rounded-xl border border-border px-3 py-2 text-sm" />
          <CampoPesos label="Valor del domicilio" valor={envio} onChange={setEnvio} />
          <div className="space-y-1.5 text-sm">
            <span className="font-semibold">Pago</span>
            <div className="flex gap-2">
              <button onClick={() => setYaPago(false)} className={`rounded-full px-3 py-1 text-xs font-semibold ${!yaPago ? "btn-primary" : "bg-muted text-muted-foreground"}`}>
                Paga al recibir
              </button>
              <button onClick={() => setYaPago(true)} className={`rounded-full px-3 py-1 text-xs font-semibold ${yaPago ? "btn-primary" : "bg-muted text-muted-foreground"}`}>
                Ya pagó
              </button>
            </div>
            {yaPago ? (
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as MetodoPago)} className="w-full rounded-xl border border-border px-2 py-1.5 text-sm">
                {METODOS_PAGO.filter((m) => m !== "EFECTIVO").map((m) => (
                  <option key={m} value={m}>
                    {METODO_PAGO_LABEL[m]}
                  </option>
                ))}
              </select>
            ) : (
              <CampoPesos compacto valor={pagaCon} onChange={setPagaCon} />
            )}
            {!yaPago ? <p className="text-[11px] text-muted-foreground">Si paga en efectivo: ¿con qué billete? (para llevar las vueltas)</p> : null}
          </div>
          <label className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground sm:col-span-2">
            <input type="checkbox" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)} className="mt-0.5" />
            <span>
              El cliente autorizó usar su nombre, teléfono y dirección solo para entregarle este pedido. Teléfono y dirección se
              borran a los 30 días (Ley 1581 de 2012).
            </span>
          </label>
        </div>
      ) : activas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Primero agrega abajo las apps con las que trabajas y su comisión.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={plataformaId} onChange={(e) => setPlataformaId(e.target.value)} className="rounded-xl border border-border px-2 py-2 text-sm">
            <option value="">¿Qué app?</option>
            {activas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.comisionPct}%)
              </option>
            ))}
          </select>
          <input value={codigoPlataforma} onChange={(e) => setCodigoPlataforma(e.target.value)} placeholder="# de la orden en la app" className="rounded-xl border border-border px-3 py-2 text-sm" />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente (opcional)" className="rounded-xl border border-border px-3 py-2 text-sm" />
        </div>
      )}

      <div className="rounded-lg bg-muted/60 p-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Productos</span>
          <span>{formatoPesos(subtotal)}</span>
        </div>
        {esDomicilio ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Domicilio</span>
            <span>{formatoPesos(envio ?? 0)}</span>
          </div>
        ) : plataforma ? (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Comisión de {plataforma.nombre} ({plataforma.comisionPct}%)</span>
            <span className="text-peligro">−{formatoPesos(Math.round((subtotal * plataforma.comisionPct) / 100))}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold">
          <span>{esDomicilio ? "Total a cobrar" : "Total de la orden"}</span>
          <span>{formatoPesos(total)}</span>
        </div>
        {vueltas !== null ? (
          <p className={`text-xs font-semibold ${vueltas < 0 ? "text-peligro" : ""}`}>
            {vueltas < 0 ? `Con ${formatoPesos(pagaCon!)} no alcanza` : `Llevar vueltas de ${formatoPesos(vueltas)}`}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-peligro">{error}</p> : null}

      <NuevoPedido
        key={version}
        productos={productos}
        comensales={[]}
        sinDestino
        titulo="Productos"
        textoEnviar={esDomicilio ? "Registrar domicilio y enviar a cocina" : "Registrar pedido de la app y enviar a cocina"}
        enviando={enviando}
        onEnviar={registrar}
        onSubtotal={setSubtotal}
      />
    </div>
  );
}
