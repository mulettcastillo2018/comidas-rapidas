"use client";

import { Segmentado } from "@/components/ui";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora } from "@/lib/formato";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { Insumos } from "@/components/inventario/Insumos";
import { EditorRecetas } from "@/components/inventario/EditorRecetas";
import { ConsumoInsumos } from "@/components/inventario/ConsumoInsumos";

interface ProductoInventario {
  id: string;
  nombre: string;
  requiereCocina: boolean;
  disponible: boolean;
  controlaStock: boolean;
  stock: number;
  stockMinimo: number;
  agotadoPorStock: boolean;
  categoria: { nombre: string };
}

interface MovimientoInventario {
  id: string;
  tipo: "ENTRADA" | "VENTA" | "DEVOLUCION" | "AJUSTE";
  cantidad: number;
  stockResultante: number;
  nota: string | null;
  creadoEn: string;
  user: { nombre: string; apellido: string } | null;
}

type Accion = { productoId: string; tipo: "ENTRADA" | "AJUSTE" | "ACTIVAR" | "MINIMO" };

const TIPO_MOVIMIENTO = { ENTRADA: "Llegó mercancía", VENTA: "Venta", DEVOLUCION: "Devolución", AJUSTE: "Ajuste por conteo" } as const;

function Estado({ p }: { p: ProductoInventario }) {
  if (p.stock <= 0) return <span className="rounded-full bg-peligro/10 px-2 py-0.5 text-[11px] font-semibold text-peligro">Agotado</span>;
  if (p.stock <= p.stockMinimo) return <span className="rounded-full bg-aviso/10 px-2 py-0.5 text-[11px] font-semibold text-aviso">Por debajo del mínimo</span>;
  return <span className="rounded-full bg-exito/10 px-2 py-0.5 text-[11px] font-semibold text-exito">Bien</span>;
}

function FormularioAccion({
  accion,
  producto,
  onEnviar,
  onCancelar,
}: {
  accion: Accion;
  producto: ProductoInventario;
  onEnviar: (valores: { cantidad: number; minimo: number; nota: string }) => void;
  onCancelar: () => void;
}) {
  const [cantidad, setCantidad] = useState(accion.tipo === "AJUSTE" ? producto.stock : 0);
  const [minimo, setMinimo] = useState(producto.stockMinimo || 5);
  const [nota, setNota] = useState("");
  const textos = {
    ENTRADA: "¿Cuántas unidades llegaron?",
    AJUSTE: "¿Cuántas hay de verdad? (contadas)",
    ACTIVAR: "¿Cuántas hay ahora?",
    MINIMO: "Avisarme cuando queden",
  };

  function enviar(event: FormEvent) {
    event.preventDefault();
    onEnviar({ cantidad, minimo, nota: nota.trim() });
  }

  return (
    <form onSubmit={enviar} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-muted/60 p-2 text-xs">
      {accion.tipo !== "MINIMO" ? (
        <label className="flex flex-col gap-1">
          {textos[accion.tipo]}
          <input type="number" min={0} value={cantidad} onChange={(e) => setCantidad(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="w-24 rounded-xl border border-border px-2 py-1" />
        </label>
      ) : null}
      {accion.tipo === "ACTIVAR" || accion.tipo === "MINIMO" ? (
        <label className="flex flex-col gap-1">
          {textos.MINIMO}
          <input type="number" min={0} value={minimo} onChange={(e) => setMinimo(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="w-24 rounded-xl border border-border px-2 py-1" />
        </label>
      ) : null}
      {accion.tipo === "ENTRADA" || accion.tipo === "AJUSTE" ? (
        <label className="flex flex-1 flex-col gap-1">
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder={accion.tipo === "ENTRADA" ? "ej. proveedor, factura" : "ej. se rompieron 2"} className="rounded-xl border border-border px-2 py-1" />
        </label>
      ) : null}
      <button type="submit" disabled={accion.tipo === "ENTRADA" && cantidad === 0} className="btn-primary rounded-xl px-3 py-1.5 disabled:opacity-50">
        Guardar
      </button>
      <button type="button" onClick={onCancelar} className="text-muted-foreground">
        Cancelar
      </button>
    </form>
  );
}

const VISTAS = [
  { id: "unidades", label: "Por unidades" },
  { id: "insumos", label: "Insumos" },
  { id: "recetas", label: "Recetas" },
  { id: "consumo", label: "Consumo y merma" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];

export default function AdminInventarioPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [vista, setVista] = useState<Vista>("unidades");

  // Un aviso de insumo bajo llega con ?vista=insumos.
  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get("vista");
    if (VISTAS.some((v) => v.id === pedida)) setVista(pedida as Vista);
  }, []);

  if (!token) return null;
  return (
    <div className="space-y-6">
      <Segmentado etiqueta="Inventario" opciones={VISTAS} valor={vista} onCambio={setVista} />
      {vista === "unidades" ? (
        <InventarioPorUnidades />
      ) : vista === "insumos" ? (
        <Insumos token={token} onAviso={showToast} />
      ) : vista === "recetas" ? (
        <EditorRecetas token={token} onAviso={showToast} />
      ) : (
        <ConsumoInsumos token={token} />
      )}
    </div>
  );
}

function InventarioPorUnidades() {
  const token = useAuthStore((state) => state.token);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [historial, setHistorial] = useState<{ productoId: string; movimientos: MovimientoInventario[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!token) return;
    setProductos(await apiFetch<ProductoInventario[]>("/inventario", { token }));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function ejecutar(producto: ProductoInventario, valores: { cantidad: number; minimo: number; nota: string }) {
    if (!token || !accion) return;
    setError(null);
    try {
      const base = `/inventario/${producto.id}`;
      if (accion.tipo === "ACTIVAR") {
        await apiFetch(`${base}/activar`, { method: "POST", token, body: JSON.stringify({ stockInicial: valores.cantidad, stockMinimo: valores.minimo }) });
      } else if (accion.tipo === "MINIMO") {
        await apiFetch(`${base}/minimo`, { method: "PUT", token, body: JSON.stringify({ stockMinimo: valores.minimo }) });
      } else {
        await apiFetch(`${base}/movimientos`, { method: "POST", token, body: JSON.stringify({ tipo: accion.tipo, cantidad: valores.cantidad, nota: valores.nota || undefined }) });
      }
      setAccion(null);
      await cargar();
      if (historial?.productoId === producto.id) await verHistorial(producto.id, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function desactivar(producto: ProductoInventario) {
    if (!token || !confirm(`¿Dejar de controlar el inventario de ${producto.nombre}? Las ventas ya no lo descontarán.`)) return;
    await apiFetch(`/inventario/${producto.id}/desactivar`, { method: "POST", token });
    await cargar();
  }

  async function verHistorial(productoId: string, forzar = false) {
    if (!token) return;
    if (!forzar && historial?.productoId === productoId) {
      setHistorial(null);
      return;
    }
    setHistorial({ productoId, movimientos: await apiFetch<MovimientoInventario[]>(`/inventario/${productoId}/movimientos`, { token }) });
  }

  const controlados = productos.filter((p) => p.controlaStock);
  const sinControl = productos.filter((p) => !p.controlaStock);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Para lo que vendes tal como lo compras (gaseosas, agua, cervezas, empacados): registras lo que llega y cada venta lo
        descuenta sola. Al llegar a cero el producto se marca agotado y te avisamos cuando queda poco.
      </p>
      {error ? <p className="text-sm text-peligro">{error}</p> : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Con inventario</h2>
        {controlados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no controlas el inventario de ningún producto. Actívalo abajo.</p>
        ) : (
          controlados.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border p-3 text-sm bg-surface shadow-suave">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {p.nombre} <span className="text-xs font-normal text-muted-foreground">· {p.categoria.nombre}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-base font-semibold tracking-tight text-foreground">{p.stock}</span> unidades · mínimo {p.stockMinimo}
                    <Estado p={p} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-semibold">
                  <button onClick={() => setAccion({ productoId: p.id, tipo: "ENTRADA" })} className="text-accent">
                    + Llegó mercancía
                  </button>
                  <button onClick={() => setAccion({ productoId: p.id, tipo: "AJUSTE" })} className="text-accent">
                    Ajustar conteo
                  </button>
                  <button onClick={() => setAccion({ productoId: p.id, tipo: "MINIMO" })} className="text-muted-foreground">
                    Mínimo
                  </button>
                  <button onClick={() => verHistorial(p.id)} className="text-muted-foreground">
                    Historial
                  </button>
                  <button onClick={() => desactivar(p)} className="text-peligro">
                    Dejar de controlar
                  </button>
                </div>
              </div>
              {accion?.productoId === p.id ? (
                <FormularioAccion accion={accion} producto={p} onEnviar={(v) => ejecutar(p, v)} onCancelar={() => setAccion(null)} />
              ) : null}
              {historial?.productoId === p.id ? (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-xs">
                  {historial.movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span>
                        {TIPO_MOVIMIENTO[m.tipo]}
                        {m.nota ? <span className="text-muted-foreground"> · {m.nota}</span> : null}
                        <span className="block text-[10px] text-muted-foreground">
                          {formatoFechaHora(m.creadoEn)}
                          {m.user ? ` · ${nombreCompleto(m.user)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`font-semibold ${m.cantidad < 0 ? "text-peligro" : "text-exito"}`}>
                          {m.cantidad > 0 ? "+" : ""}
                          {m.cantidad}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">quedan {m.stockResultante}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </section>

      {sinControl.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight">Sin inventario</h2>
          <p className="text-xs text-muted-foreground">
            Ideal para lo que no pasa por cocina. Lo que se prepara (hamburguesas, papas) depende de varios insumos, así
            que no se controla por unidades.
          </p>
          {sinControl.map((p) => (
            <div key={p.id} className="rounded-2xl border border-dashed border-border p-3 text-sm bg-surface shadow-suave">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {p.nombre} <span className="text-xs text-muted-foreground">· {p.categoria.nombre}</span>
                  {!p.requiereCocina ? <span className="ml-2 text-[11px] text-accent">recomendado</span> : null}
                </span>
                <button onClick={() => setAccion({ productoId: p.id, tipo: "ACTIVAR" })} className="text-xs font-semibold text-accent">
                  Controlar inventario
                </button>
              </div>
              {accion?.productoId === p.id ? (
                <FormularioAccion accion={accion} producto={p} onEnviar={(v) => ejecutar(p, v)} onCancelar={() => setAccion(null)} />
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
