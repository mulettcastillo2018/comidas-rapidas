"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { formatoPesos } from "@/lib/formato";
import { resolverImagenUrl } from "@/lib/images";
import { precioConAdiciones } from "@/lib/items";
import type { Comensal, Producto } from "@/lib/types";

export interface ItemBorrador {
  productoId: string;
  comensalId: string | null;
  paraLlevar: boolean;
  cantidad: number;
  notas: string;
  adicionIds: string[];
}

// Con inventario y pocas unidades: se le muestra al mesero para que no
// ofrezca lo que no hay.
function quedanPocas(p: Producto) {
  return Boolean(p.controlaStock) && (p.stock ?? 0) > 0 && (p.stock ?? 0) <= Math.max(p.stockMinimo ?? 0, 5);
}

// "Para" del producto: un comensal, "compartir" (para la mesa) o "llevar"
// (para alguien que no está en la mesa).
const COMPARTIR = "compartir";
const LLEVAR = "llevar";

export function etiquetaDestino(comensales: Comensal[] | undefined, comensalId: string | null, paraLlevar?: boolean) {
  if (paraLlevar) return "🥡 Para llevar";
  if (!comensalId) return "Para compartir";
  return comensales?.find((c) => c.id === comensalId)?.nombre ?? "—";
}

export function NuevoPedido({
  productos,
  comensales,
  enviando,
  onEnviar,
  sinDestino,
  titulo = "Nuevo pedido",
  textoEnviar = "Enviar pedido",
  onSubtotal,
}: {
  productos: Producto[];
  comensales: Comensal[];
  enviando: boolean;
  onEnviar: (items: ItemBorrador[]) => Promise<boolean>;
  // Sin mesa (domicilios, apps): no hay a quién asignar cada producto.
  sinDestino?: boolean;
  titulo?: string;
  textoEnviar?: string;
  // Valor de lo que va en el borrador, para mostrar el total afuera.
  onSubtotal?: (subtotal: number) => void;
}) {
  const [borrador, setBorrador] = useState<ItemBorrador[]>([]);
  const [productoId, setProductoId] = useState("");
  const [destino, setDestino] = useState(COMPARTIR);
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState("");
  const [adicionIds, setAdicionIds] = useState<string[]>([]);

  // Al cambiar de producto, las adiciones elegidas ya no aplican.
  useEffect(() => setAdicionIds([]), [productoId]);

  // Agrupados por categoría para no buscar en una lista larga revuelta.
  const porCategoria = useMemo(() => {
    const grupos = new Map<string, Producto[]>();
    for (const p of productos) {
      const categoria = p.categoria?.nombre ?? "Otros";
      grupos.set(categoria, [...(grupos.get(categoria) ?? []), p]);
    }
    return Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [productos]);

  // Si el seleccionado se agota (cocina lo marca en vivo), pasar al primero disponible.
  useEffect(() => {
    const actual = productos.find((p) => p.id === productoId);
    if (!actual || !actual.disponible) setProductoId(productos.find((p) => p.disponible)?.id ?? "");
  }, [productos, productoId]);

  const seleccionado = productos.find((p) => p.id === productoId);
  const imagen = resolverImagenUrl(seleccionado?.imagenUrl);
  const agotadosEnBorrador = borrador.filter((i) => !productos.find((p) => p.id === i.productoId)?.disponible);
  const subtotal = borrador.reduce(
    (s, i) => s + precioConAdiciones(productos.find((p) => p.id === i.productoId), i.adicionIds) * i.cantidad,
    0
  );

  useEffect(() => {
    onSubtotal?.(subtotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  function agregar() {
    if (!productoId) return;
    setBorrador((prev) => [
      ...prev,
      {
        productoId,
        comensalId: destino === COMPARTIR || destino === LLEVAR ? null : destino,
        paraLlevar: destino === LLEVAR,
        cantidad,
        notas: notas.trim(),
        adicionIds,
      },
    ]);
    setCantidad(1);
    setNotas("");
    setAdicionIds([]);
  }

  async function enviar() {
    if (await onEnviar(borrador)) setBorrador([]);
  }

  return (
    <section className="mt-6 rounded-xl border border-border p-4">
      <h2 className="text-sm font-bold">{titulo}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 max-w-full">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Producto</label>
          <div className="flex items-center gap-2">
            {imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagen} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            ) : null}
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="max-w-full rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              {porCategoria.map(([categoria, lista]) => (
                <optgroup key={categoria} label={categoria}>
                  {lista.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.disponible}>
                      {p.esCombo ? "🍱 " : ""}
                      {p.nombre} — {formatoPesos(p.promocion?.precio ?? p.precio)}
                      {p.promocion ? ` (antes ${formatoPesos(p.precio)})` : ""}{" "}
                      {!p.disponible ? "(agotado)" : quedanPocas(p) ? `(quedan ${p.stock})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {seleccionado && !seleccionado.requiereCocina ? (
            <p className="mt-1 text-[11px] text-muted-foreground">No pasa por cocina: queda listo para que lo lleves.</p>
          ) : null}
          {seleccionado && quedanPocas(seleccionado) ? (
            <p className="mt-1 text-[11px] font-semibold text-amber-700">Solo quedan {seleccionado.stock}.</p>
          ) : null}
          {seleccionado?.promocion ? (
            <p className="mt-1 text-[11px] font-semibold text-green-700">
              🏷️ {seleccionado.promocion.nombre}: −{seleccionado.promocion.descuentoPct}%
            </p>
          ) : null}
          {seleccionado?.esCombo ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Trae: {seleccionado.componentes?.map((c) => `${c.cantidad > 1 ? `${c.cantidad}× ` : ""}${c.producto.nombre}`).join(" + ")}
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Cantidad</label>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
            className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
          />
        </div>
        {!sinDestino ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Para</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="rounded-lg border border-border px-2 py-1.5 text-sm">
              <option value={COMPARTIR}>Para compartir</option>
              <option value={LLEVAR}>🥡 Para llevar</option>
              {comensales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Notas (opcional)</label>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej. sin cebolla"
            className="w-full min-w-32 rounded-lg border border-border px-2 py-1.5 text-sm"
          />
        </div>
        <button onClick={agregar} disabled={!productoId} className="rounded-full border border-accent px-4 py-1.5 text-sm font-semibold text-accent disabled:opacity-50">
          + Agregar
        </button>
      </div>

      {seleccionado && (seleccionado.adiciones?.length ?? 0) > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {seleccionado.adiciones!.map((a) => {
            const elegida = adicionIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAdicionIds((prev) => (elegida ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${elegida ? "border-accent bg-accent text-white" : "border-border text-muted-foreground"}`}
              >
                {a.nombre}
                {a.precio > 0 ? ` +${formatoPesos(a.precio)}` : ""}
              </button>
            );
          })}
          {adicionIds.length > 0 ? (
            <span className="self-center text-xs text-muted-foreground">= {formatoPesos(precioConAdiciones(seleccionado, adicionIds))} c/u</span>
          ) : null}
        </div>
      ) : null}

      {borrador.length > 0 ? (
        <div className="mt-4 space-y-1.5 border-t border-border pt-3">
          {borrador.map((item, index) => {
            const producto = productos.find((p) => p.id === item.productoId);
            return (
              <div key={index} className="flex items-center justify-between gap-2 text-sm">
                <span className={producto && !producto.disponible ? "text-red-600" : ""}>
                  {item.cantidad}× {producto?.nombre ?? "Producto"}
                  {item.adicionIds.length > 0
                    ? ` + ${(producto?.adiciones ?? []).filter((a) => item.adicionIds.includes(a.id)).map((a) => a.nombre).join(", ")}`
                    : ""}
                  {!sinDestino ? ` — ${etiquetaDestino(comensales, item.comensalId, item.paraLlevar)}` : ""}
                  {item.notas ? ` (${item.notas})` : ""}
                  {producto && !producto.disponible ? " — se agotó" : ""}
                  <span className="ml-1 text-xs text-muted-foreground">{formatoPesos(precioConAdiciones(producto, item.adicionIds) * item.cantidad)}</span>
                </span>
                <button onClick={() => setBorrador((prev) => prev.filter((_, i) => i !== index))} className="text-muted-foreground hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          {agotadosEnBorrador.length > 0 ? (
            <p className="text-xs text-red-600">Cocina marcó como agotado algo de este pedido. Quítalo para poder enviarlo.</p>
          ) : null}
          <button
            onClick={enviar}
            disabled={enviando || agotadosEnBorrador.length > 0}
            className="btn-primary mt-2 w-full rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Enviando…" : textoEnviar}
          </button>
        </div>
      ) : null}
    </section>
  );
}
