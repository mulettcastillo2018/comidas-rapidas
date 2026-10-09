"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import { formatoCantidad, UNIDAD_CORTA, type Insumo, type Receta, type UnidadInsumo } from "@/lib/insumos";
import type { Producto } from "@/lib/types";

interface Fila {
  insumoId: string;
  cantidad: string;
}

interface AdicionConInsumos {
  id: string;
  nombre: string;
  precio: number;
  insumos: { insumoId: string; cantidad: number }[];
}

// Receta de un producto (o los ingredientes de una adición): cuánto de cada
// insumo lleva una unidad. Con eso se descuenta el inventario y se calcula
// cuánto cuesta prepararlo.
export function EditorRecetas({ token, onAviso }: { token: string; onAviso: (m: string) => void }) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [adiciones, setAdiciones] = useState<{ id: string; nombre: string; precio: number }[]>([]);
  const [seleccion, setSeleccion] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [costoDesdeReceta, setCostoDesdeReceta] = useState(true);
  const [receta, setReceta] = useState<Receta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Insumo[]>("/insumos", { token }).then((l) => setInsumos(l.filter((i) => i.activo)));
    apiFetch<Producto[]>("/productos", { token }).then((l) => setProductos(l.filter((p) => p.isActive && !p.esCombo)));
    apiFetch<{ id: string; nombre: string; precio: number }[]>("/adiciones", { token }).then(setAdiciones);
  }, [token]);

  const [tipo, id] = seleccion.split(":");
  const producto = productos.find((p) => p.id === id);

  useEffect(() => {
    setError(null);
    setReceta(null);
    if (!id) return setFilas([]);
    if (tipo === "p") {
      apiFetch<Receta>(`/insumos/recetas/${id}`, { token }).then((r) => {
        setReceta(r);
        setCostoDesdeReceta(r.receta.length === 0 ? true : r.costoDesdeReceta);
        setFilas(r.receta.map((i) => ({ insumoId: i.insumoId, cantidad: String(i.cantidad) })));
      });
    } else {
      apiFetch<AdicionConInsumos>(`/insumos/adiciones/${id}`, { token }).then((a) => setFilas(a.insumos.map((i) => ({ insumoId: i.insumoId, cantidad: String(i.cantidad) }))));
    }
  }, [token, tipo, id]);

  const insumoDe = (insumoId: string) => insumos.find((i) => i.id === insumoId);
  const costo = Math.round(filas.reduce((s, f) => s + (Number(f.cantidad) || 0) * (insumoDe(f.insumoId)?.costoUnitario ?? 0), 0));
  const precio = tipo === "p" ? producto?.precio : adiciones.find((a) => a.id === id)?.precio;
  const margen = precio ? Math.round(((precio - costo) / precio) * 100) : null;
  const validas = filas.filter((f) => f.insumoId && Number(f.cantidad) > 0);

  async function guardar() {
    setError(null);
    try {
      const cuerpo = JSON.stringify({ items: validas.map((f) => ({ insumoId: f.insumoId, cantidad: Number(f.cantidad) })), costoDesdeReceta });
      if (tipo === "p") {
        const r = await apiFetch<Receta>(`/insumos/recetas/${id}`, { method: "PUT", token, body: cuerpo });
        setReceta(r);
        onAviso(`Receta de ${r.nombre} guardada${r.costoDesdeReceta ? ` · costo ${formatoPesos(r.costo ?? 0)}` : ""}`);
      } else {
        await apiFetch(`/insumos/adiciones/${id}`, { method: "PUT", token, body: cuerpo });
        onAviso("Ingredientes de la adición guardados");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la receta.");
    }
  }

  return (
    <div className="space-y-3">
      <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="w-full max-w-md rounded-xl border border-border px-2 py-2 text-sm">
        <option value="">¿De qué producto o adición?</option>
        <optgroup label="Productos">
          {productos.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.nombre}
            </option>
          ))}
        </optgroup>
        {adiciones.length > 0 ? (
          <optgroup label="Adiciones">
            {adiciones.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>
                {a.nombre}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {id ? (
        insumos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Primero crea los insumos en la pestaña Insumos.</p>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border p-3 text-sm bg-surface shadow-suave">
            <p className="text-xs text-muted-foreground">Cantidad para una unidad de lo que se vende.</p>
            {filas.map((f, n) => {
              const insumo = insumoDe(f.insumoId);
              return (
                <div key={n} className="flex items-center gap-2">
                  <select
                    value={f.insumoId}
                    onChange={(e) => setFilas((prev) => prev.map((x, j) => (j === n ? { ...x, insumoId: e.target.value } : x)))}
                    className="min-w-0 flex-1 rounded-xl border border-border px-2 py-1.5"
                  >
                    <option value="">Ingrediente…</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    value={f.cantidad}
                    onChange={(e) => setFilas((prev) => prev.map((x, j) => (j === n ? { ...x, cantidad: e.target.value.replace(",", ".") } : x)))}
                    inputMode="decimal"
                    className="w-20 rounded-xl border border-border px-2 py-1.5"
                  />
                  <span className="w-8 text-xs text-muted-foreground">{insumo ? UNIDAD_CORTA[insumo.unidad as UnidadInsumo] : ""}</span>
                  <button onClick={() => setFilas((prev) => prev.filter((_, j) => j !== n))} className="text-muted-foreground hover:text-peligro" aria-label="Quitar">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <button onClick={() => setFilas((prev) => [...prev, { insumoId: "", cantidad: "" }])} className="text-xs font-semibold text-accent">
              + Ingrediente
            </button>
            <div className="rounded-lg bg-muted/60 p-2 text-xs">
              Costo de preparación: <strong>{formatoPesos(costo)}</strong>
              {precio ? ` · precio ${formatoPesos(precio)} · margen ${margen}%` : ""}
              {validas.map((f) => {
                const i = insumoDe(f.insumoId);
                return i ? <span key={f.insumoId} className="block text-muted-foreground">{`${i.nombre}: ${formatoCantidad(Number(f.cantidad), i.unidad)} = ${formatoPesos(Math.round(Number(f.cantidad) * i.costoUnitario))}`}</span> : null;
              })}
            </div>
            {tipo === "p" ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={costoDesdeReceta} onChange={(e) => setCostoDesdeReceta(e.target.checked)} />
                Usar este costo como el costo del producto (se actualiza solo cuando cambia el precio de un insumo)
                {receta && !receta.costoDesdeReceta && receta.costo !== null ? ` · hoy tiene ${formatoPesos(receta.costo)} digitado a mano` : ""}
              </label>
            ) : null}
            {error ? <p className="text-xs text-peligro">{error}</p> : null}
            <button onClick={guardar} className="btn-primary rounded-xl px-4 py-1.5 text-xs">
              Guardar
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
