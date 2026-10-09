"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageCheck, Plus, Tag, Trash2 } from "lucide-react";
import { Boton, CabeceraTarjeta, Campo, cx, Entrada, Insignia, Selector } from "@/components/ui";
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
  if (paraLlevar) return "Para llevar";
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
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-suave sm:p-6">
      <CabeceraTarjeta titulo={titulo} />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Producto" className="min-w-0 flex-[2_1_16rem]">
          {(control) => (
            <div className="flex items-center gap-2.5">
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt="" className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-border" />
              ) : null}
              <Selector value={productoId} onChange={(e) => setProductoId(e.target.value)} contenedor="min-w-0 flex-1" {...control}>
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
              </Selector>
            </div>
          )}
        </Campo>
        <Campo etiqueta="Cantidad" className="w-24">
          {(control) => (
            <Entrada type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} className="tabular-nums" {...control} />
          )}
        </Campo>
        {!sinDestino ? (
          <Campo etiqueta="Para" className="min-w-36 flex-[1_1_9rem]">
            {(control) => (
              <Selector value={destino} onChange={(e) => setDestino(e.target.value)} {...control}>
                <option value={COMPARTIR}>Para compartir</option>
                <option value={LLEVAR}>Para llevar</option>
                {comensales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
        ) : null}
        <Campo etiqueta="Notas (opcional)" className="min-w-40 flex-[1.5_1_10rem]">
          {(control) => <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. sin cebolla" {...control} />}
        </Campo>
        <Boton variante="secundario" onClick={agregar} disabled={!productoId} className="ml-auto text-accent">
          <Plus /> Agregar
        </Boton>
      </div>

      {seleccionado &&
      (!seleccionado.requiereCocina || quedanPocas(seleccionado) || seleccionado.promocion || seleccionado.esCombo) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!seleccionado.requiereCocina ? (
            <Insignia tono="info">
              <PackageCheck aria-hidden /> No pasa por cocina: queda listo para que lo lleves.
            </Insignia>
          ) : null}
          {quedanPocas(seleccionado) ? <Insignia tono="aviso">Solo quedan {seleccionado.stock}.</Insignia> : null}
          {seleccionado.promocion ? (
            <Insignia tono="exito">
              <Tag aria-hidden /> {seleccionado.promocion.nombre}: −{seleccionado.promocion.descuentoPct}%
            </Insignia>
          ) : null}
          {seleccionado.esCombo ? (
            <Insignia>
              Trae: {seleccionado.componentes?.map((c) => `${c.cantidad > 1 ? `${c.cantidad}× ` : ""}${c.producto.nombre}`).join(" + ")}
            </Insignia>
          ) : null}
        </div>
      ) : null}

      {seleccionado && (seleccionado.adiciones?.length ?? 0) > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Adiciones:</span>
          {seleccionado.adiciones!.map((a) => {
            const elegida = adicionIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={elegida}
                onClick={() => setAdicionIds((prev) => (elegida ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-all duration-200 ease-resorte active:scale-95",
                  elegida ? "bg-accent text-accent-foreground ring-accent" : "bg-surface text-muted-foreground ring-border hover:text-foreground hover:ring-border-strong",
                )}
              >
                {a.nombre}
                {a.precio > 0 ? ` +${formatoPesos(a.precio)}` : ""}
              </button>
            );
          })}
          {adicionIds.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">= {formatoPesos(precioConAdiciones(seleccionado, adicionIds))} c/u</span>
          ) : null}
        </div>
      ) : null}

      {borrador.length > 0 ? (
        <div className="mt-5 animate-aparecer rounded-2xl bg-surface-2/70 p-3 ring-1 ring-border ring-inset sm:p-4">
          <ul className="divide-y divide-border/80">
            {borrador.map((item, index) => {
              const producto = productos.find((p) => p.id === item.productoId);
              const agotado = Boolean(producto && !producto.disponible);
              return (
                <li key={index} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className={cx("min-w-0", agotado && "text-peligro")}>
                    <span className="font-semibold tabular-nums">{item.cantidad}×</span> {producto?.nombre ?? "Producto"}
                    {item.adicionIds.length > 0
                      ? ` + ${(producto?.adiciones ?? []).filter((a) => item.adicionIds.includes(a.id)).map((a) => a.nombre).join(", ")}`
                      : ""}
                    {!sinDestino ? <span className="text-muted-foreground"> — {etiquetaDestino(comensales, item.comensalId, item.paraLlevar)}</span> : null}
                    {item.notas ? <span className="text-muted-foreground"> ({item.notas})</span> : null}
                    {agotado ? <span className="font-semibold"> — se agotó</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{formatoPesos(precioConAdiciones(producto, item.adicionIds) * item.cantidad)}</span>
                    <button
                      onClick={() => setBorrador((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Quitar ${producto?.nombre ?? "producto"}`}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-peligro/10 hover:text-peligro"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {agotadosEnBorrador.length > 0 ? (
            <p className="mt-3 text-xs font-medium text-peligro">Cocina marcó como agotado algo de este pedido. Quítalo para poder enviarlo.</p>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Subtotal <span className="ml-1 text-lg font-semibold text-foreground tabular-nums">{formatoPesos(subtotal)}</span>
            </p>
            <Boton onClick={enviar} cargando={enviando} disabled={agotadosEnBorrador.length > 0} className="sm:min-w-48">
              {enviando ? "Enviando…" : textoEnviar}
            </Boton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
