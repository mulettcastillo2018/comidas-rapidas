"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { CampoPesos } from "@/components/CampoPesos";
import {
  formatoCantidad,
  formatoCostoUnitario,
  PRESENTACIONES,
  UNIDAD_LABEL,
  type Insumo,
  type MovimientoInsumo,
  type UnidadInsumo,
} from "@/lib/insumos";

const TIPO_MOVIMIENTO = { COMPRA: "Compra", CONSUMO: "Vendido", DEVOLUCION: "Devuelto (cancelado)", AJUSTE: "Conteo / ajuste" } as const;

// Cantidad con su presentación (kg, g, L, ml, und); devuelve la cantidad en
// la unidad base.
function CampoCantidad({ unidad, onCambio }: { unidad: UnidadInsumo; onCambio: (base: number | null) => void }) {
  const opciones = PRESENTACIONES[unidad];
  const [valor, setValor] = useState("");
  const [factor, setFactor] = useState(opciones[0].factor);
  const avisar = (v: string, f: number) => {
    const n = Number(v.replace(",", "."));
    onCambio(v.trim() === "" || Number.isNaN(n) ? null : n * f);
  };
  return (
    <div className="flex gap-1">
      <input
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          avisar(e.target.value, factor);
        }}
        inputMode="decimal"
        placeholder="0"
        className="w-24 rounded-xl border border-border px-2 py-1.5 text-sm"
      />
      {opciones.length > 1 ? (
        <select
          value={factor}
          onChange={(e) => {
            setFactor(Number(e.target.value));
            avisar(valor, Number(e.target.value));
          }}
          className="rounded-xl border border-border px-1 py-1.5 text-sm"
        >
          {opciones.map((o) => (
            <option key={o.etiqueta} value={o.factor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <span className="self-center text-sm text-muted-foreground">und</span>
      )}
    </div>
  );
}

function NuevoInsumo({ token, onCreado }: { token: string; onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState<UnidadInsumo>("GRAMO");
  const [stock, setStock] = useState<number | null>(null);
  const [minimo, setMinimo] = useState<number | null>(null);
  const [cantidadRef, setCantidadRef] = useState<number | null>(null);
  const [precioRef, setPrecioRef] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/insumos", {
        method: "POST",
        token,
        body: JSON.stringify({
          nombre: nombre.trim(),
          unidad,
          stockInicial: stock ?? 0,
          stockMinimo: minimo ?? 0,
          // "Un kg me cuesta $30.000" → pesos por gramo.
          costoUnitario: cantidadRef && precioRef ? precioRef / cantidadRef : 0,
        }),
      });
      setNombre("");
      setStock(null);
      setMinimo(null);
      setCantidadRef(null);
      setPrecioRef(null);
      setVersion((v) => v + 1);
      onCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el insumo.");
    }
  }

  return (
    <form key={`${unidad}-${version}`} onSubmit={crear} className="space-y-2 rounded-2xl border border-border p-3 text-sm bg-surface shadow-suave">
      <p className="font-semibold">Nuevo insumo</p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-xs font-semibold text-muted-foreground">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Carne de res" className="rounded-xl border border-border px-2 py-1.5" />
        </label>
        <label>
          <span className="block text-xs font-semibold text-muted-foreground">Se mide en</span>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadInsumo)} className="rounded-xl border border-border px-2 py-1.5">
            {(Object.keys(UNIDAD_LABEL) as UnidadInsumo[]).map((u) => (
              <option key={u} value={u}>
                {UNIDAD_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs font-semibold text-muted-foreground">Hay ahora</span>
          <CampoCantidad unidad={unidad} onCambio={setStock} />
        </label>
        <label>
          <span className="block text-xs font-semibold text-muted-foreground">Avisar cuando queden</span>
          <CampoCantidad unidad={unidad} onCambio={setMinimo} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Costo: </span>
        <CampoCantidad unidad={unidad} onCambio={setCantidadRef} />
        <span className="text-xs text-muted-foreground">me cuestan</span>
        <div className="w-32">
          <CampoPesos compacto valor={precioRef} onChange={setPrecioRef} />
        </div>
      </div>
      {error ? <p className="text-xs text-peligro">{error}</p> : null}
      <button disabled={nombre.trim().length < 2} className="btn-primary rounded-xl px-4 py-1.5 text-xs disabled:opacity-50">
        Crear insumo
      </button>
    </form>
  );
}

function Compra({ token, insumo, onListo }: { token: string; insumo: Insumo; onListo: (m: string) => void }) {
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [costo, setCosto] = useState<number | null>(null);
  const [gasto, setGasto] = useState(true);
  const [caja, setCaja] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar() {
    setError(null);
    try {
      await apiFetch(`/insumos/${insumo.id}/compras`, {
        method: "POST",
        token,
        body: JSON.stringify({ cantidad, costoTotal: costo ?? 0, registrarGasto: gasto, desdeCaja: gasto && caja }),
      });
      onListo(`Compra de ${insumo.nombre} registrada${gasto ? " (y como gasto de insumos)" : ""}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la compra.");
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        Llegaron <CampoCantidad unidad={insumo.unidad} onCambio={setCantidad} /> por
        <div className="w-32">
          <CampoPesos compacto valor={costo} onChange={setCosto} />
        </div>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={gasto} onChange={(e) => setGasto(e.target.checked)} /> Registrarla también como gasto de insumos
      </label>
      {gasto ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={caja} onChange={(e) => setCaja(e.target.checked)} /> Se pagó con efectivo de la caja
        </label>
      ) : null}
      {error ? <p className="text-peligro">{error}</p> : null}
      <button onClick={registrar} disabled={!cantidad || cantidad <= 0} className="btn-primary rounded-full px-4 py-1 disabled:opacity-50">
        Registrar compra
      </button>
    </div>
  );
}

function Conteo({ token, insumo, onListo }: { token: string; insumo: Insumo; onListo: (m: string) => void }) {
  const [real, setReal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diferencia = real !== null ? real - insumo.stock : null;

  async function guardar() {
    setError(null);
    try {
      await apiFetch(`/insumos/${insumo.id}/conteo`, { method: "POST", token, body: JSON.stringify({ stockReal: real }) });
      onListo(`Conteo de ${insumo.nombre} guardado`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el conteo.");
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        Contado de verdad: <CampoCantidad unidad={insumo.unidad} onCambio={setReal} />
        {diferencia !== null ? (
          <span className={diferencia < 0 ? "font-semibold text-peligro" : "text-muted-foreground"}>
            {diferencia < 0
              ? `Faltan ${formatoCantidad(-diferencia, insumo.unidad)} (${formatoPesos(Math.round(-diferencia * insumo.costoUnitario))}) frente a lo que dicen las recetas`
              : diferencia > 0
                ? `Sobran ${formatoCantidad(diferencia, insumo.unidad)}`
                : "Cuadra con las recetas"}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-peligro">{error}</p> : null}
      <button onClick={guardar} disabled={real === null} className="btn-primary rounded-full px-4 py-1 disabled:opacity-50">
        Guardar conteo
      </button>
    </div>
  );
}

export function Insumos({ token, onAviso }: { token: string; onAviso: (m: string) => void }) {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; modo: "compra" | "conteo" | "historial" } | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    apiFetch<Insumo[]>("/insumos", { token })
      .then(setInsumos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar los insumos."));
  }, [token]);
  useEffect(cargar, [cargar]);

  async function abrir(id: string, modo: "compra" | "conteo" | "historial") {
    if (abierto?.id === id && abierto.modo === modo) return setAbierto(null);
    setAbierto({ id, modo });
    if (modo === "historial") setMovimientos(await apiFetch<MovimientoInsumo[]>(`/insumos/${id}/movimientos`, { token }));
  }

  const listo = (m: string) => {
    setAbierto(null);
    onAviso(m);
    cargar();
  };

  const valorTotal = (insumos ?? []).reduce((s, i) => s + i.valorEnInventario, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Los ingredientes con que preparas: cada venta descuenta lo que dice la receta del plato. No frena ventas (los conteos de cocina nunca
        son exactos): te avisa cuando algo baja del mínimo, y al contar ves cuánto se pierde.
      </p>
      <NuevoInsumo token={token} onCreado={() => listo("Insumo creado")} />
      {error ? <p className="text-sm text-peligro">{error}</p> : null}
      {insumos && insumos.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">Valor aproximado en inventario: {formatoPesos(valorTotal)}</p>
          <ul className="space-y-2">
            {insumos.map((i) => (
              <li key={i.id} className={`rounded-2xl border p-3 text-sm bg-surface shadow-suave ${i.stock <= i.stockMinimo ? "border-aviso" : "border-border"} ${i.activo ? "" : "opacity-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{i.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatoCostoUnitario(i.costoUnitario, i.unidad)} ·{" "}
                      {i.usadoEn.length > 0 ? `en ${i.usadoEn.slice(0, 4).join(", ")}${i.usadoEn.length > 4 ? "…" : ""}` : "no está en ninguna receta"}
                      {i.enAdiciones > 0 ? ` · ${i.enAdiciones} adición(es)` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${i.stock <= 0 ? "text-peligro" : i.stock <= i.stockMinimo ? "text-aviso" : ""}`}>{formatoCantidad(i.stock, i.unidad)}</p>
                    <p className="text-[11px] text-muted-foreground">mínimo {formatoCantidad(i.stockMinimo, i.unidad)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button onClick={() => abrir(i.id, "compra")} className="font-semibold text-accent">
                    Registrar compra
                  </button>
                  <button onClick={() => abrir(i.id, "conteo")} className="font-semibold text-accent">
                    Contar
                  </button>
                  <button onClick={() => abrir(i.id, "historial")} className="text-muted-foreground">
                    Movimientos
                  </button>
                </div>
                {abierto?.id === i.id && abierto.modo === "compra" ? <Compra token={token} insumo={i} onListo={listo} /> : null}
                {abierto?.id === i.id && abierto.modo === "conteo" ? <Conteo token={token} insumo={i} onListo={listo} /> : null}
                {abierto?.id === i.id && abierto.modo === "historial" ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {movimientos.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span>
                          {formatoFechaHora(m.creadoEn)} · {TIPO_MOVIMIENTO[m.tipo]}
                          {m.nota ? ` (${m.nota})` : ""}
                          {m.usuario ? ` · ${m.usuario}` : ""}
                        </span>
                        <span className={m.cantidad < 0 ? "text-peligro" : "text-exito"}>
                          {m.cantidad > 0 ? "+" : ""}
                          {formatoCantidad(m.cantidad, i.unidad)} → {formatoCantidad(m.stockResultante, i.unidad)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : insumos ? (
        <p className="text-sm text-muted-foreground">Todavía no hay insumos. Crea los principales (carne, pan, papa, queso...).</p>
      ) : (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}
    </div>
  );
}
