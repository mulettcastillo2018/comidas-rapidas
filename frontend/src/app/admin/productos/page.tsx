"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError, uploadFile } from "@/lib/api";
import { resolverImagenUrl } from "@/lib/images";
import { useAuthStore } from "@/store/auth.store";
import { formatoPesos } from "@/lib/formato";
import { reducirImagen } from "@/lib/imagen";
import { CampoPesos } from "@/components/CampoPesos";
import type { Categoria, Producto } from "@/lib/types";

interface ProductoFormValues {
  nombre: string;
  descripcion: string;
  precio: number;
  tiempoPreparacionMinutos: number;
  categoriaId: string;
  imagenUrl: string | null;
  requiereCocina: boolean;
  costo: number | null;
  disponible: boolean;
  isActive: boolean;
  esCombo: boolean;
  componentes: { productoId: string; cantidad: number }[];
}

const EMPTY_VALUES: Omit<ProductoFormValues, "categoriaId"> = {
  nombre: "",
  descripcion: "",
  precio: 0,
  tiempoPreparacionMinutos: 10,
  imagenUrl: null,
  requiereCocina: true,
  costo: null,
  disponible: true,
  isActive: true,
  esCombo: false,
  componentes: [],
};

// Qué trae un combo: productos normales y cuántos de cada uno. Muestra cuánto
// costarían por separado para ver el ahorro que ofrece.
function EditorCombo({
  productos,
  componentes,
  precioCombo,
  onChange,
}: {
  productos: Producto[];
  componentes: { productoId: string; cantidad: number }[];
  precioCombo: number;
  onChange: (c: { productoId: string; cantidad: number }[]) => void;
}) {
  const elegibles = productos.filter((p) => !p.esCombo && p.isActive);
  const separado = componentes.reduce((s, c) => s + (productos.find((p) => p.id === c.productoId)?.precio ?? 0) * c.cantidad, 0);
  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
      <p className="text-xs font-semibold">Productos que trae el combo</p>
      {componentes.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={c.productoId}
            onChange={(e) => onChange(componentes.map((x, j) => (j === i ? { ...x, productoId: e.target.value } : x)))}
            className="flex-1 rounded-xl border border-border px-2 py-1.5"
          >
            {elegibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {formatoPesos(p.precio)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={10}
            value={c.cantidad}
            onChange={(e) => onChange(componentes.map((x, j) => (j === i ? { ...x, cantidad: Math.min(10, Math.max(1, Number(e.target.value) || 1)) } : x)))}
            className="w-16 rounded-xl border border-border px-2 py-1.5"
          />
          <button type="button" onClick={() => onChange(componentes.filter((_, j) => j !== i))} className="text-xs text-peligro">
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={elegibles.length === 0}
        onClick={() => onChange([...componentes, { productoId: elegibles[0].id, cantidad: 1 }])}
        className="text-xs font-semibold text-accent"
      >
        + Agregar producto
      </button>
      {separado > 0 ? (
        <p className="text-xs text-muted-foreground">
          Por separado costaría {formatoPesos(separado)}
          {precioCombo > 0 && precioCombo < separado ? ` · el combo ahorra ${formatoPesos(separado - precioCombo)}` : ""}.
        </p>
      ) : null}
    </div>
  );
}

function ProductoForm({
  categorias,
  productos,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  loading,
}: {
  categorias: Categoria[];
  productos: Producto[];
  initialValues?: Partial<ProductoFormValues>;
  onSubmit: (values: ProductoFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
  loading?: boolean;
}) {
  const [values, setValues] = useState<ProductoFormValues>({
    ...EMPTY_VALUES,
    categoriaId: categorias[0]?.id ?? "",
    ...initialValues,
  });

  function update<K extends keyof ProductoFormValues>(key: K, value: ProductoFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-3"
    >
      <input
        value={values.nombre}
        onChange={(e) => update("nombre", e.target.value)}
        placeholder="Nombre"
        required
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <textarea
        value={values.descripcion}
        onChange={(e) => update("descripcion", e.target.value)}
        placeholder="Descripción"
        required
        rows={2}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoPesos label="Precio de venta" valor={values.precio || null} onChange={(v) => update("precio", v ?? 0)} />
        <CampoPesos
          label="Costo"
          ayuda="Opcional: lo que te cuesta una unidad (insumos + empaque)"
          valor={values.costo}
          onChange={(v) => update("costo", v)}
        />
        <label className="block text-sm">
          <span className="font-semibold">Preparación (min)</span>
          <input
            type="number"
            value={values.tiempoPreparacionMinutos}
            onChange={(e) => update("tiempoPreparacionMinutos", Number(e.target.value))}
            required
            min={1}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>
      {values.costo !== null && values.precio > 0 ? (
        <p className={`text-xs ${values.costo >= values.precio ? "text-peligro" : "text-muted-foreground"}`}>
          {values.costo >= values.precio
            ? "Ojo: el costo es igual o mayor que el precio, este producto no deja ganancia."
            : `Deja ${formatoPesos(values.precio - values.costo)} por unidad (margen del ${Math.round(((values.precio - values.costo) / values.precio) * 100)}%).`}
        </p>
      ) : null}
      <select
        value={values.categoriaId}
        onChange={(e) => update("categoriaId", e.target.value)}
        required
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      >
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <input
        value={values.imagenUrl ?? ""}
        onChange={(e) => update("imagenUrl", e.target.value === "" ? null : e.target.value)}
        placeholder="URL de imagen (opcional)"
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={values.disponible} onChange={(e) => update("disponible", e.target.checked)} />
        Disponible hoy
      </label>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={values.esCombo}
          onChange={(e) => update("esCombo", e.target.checked)}
          className="mt-1"
        />
        <span>
          Es un combo
          <span className="block text-xs">
            Un precio por varios productos (ej. hamburguesa + papas + gaseosa). Al pedirlo, cocina ve cada parte por separado.
          </span>
        </span>
      </label>
      {values.esCombo ? (
        <EditorCombo productos={productos} componentes={values.componentes} precioCombo={values.precio} onChange={(c) => update("componentes", c)} />
      ) : (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={values.requiereCocina}
            onChange={(e) => update("requiereCocina", e.target.checked)}
            className="mt-1"
          />
          <span>
            Pasa por cocina
            <span className="block text-xs">
              Desmárcalo en bebidas o productos listos para servir: el mesero los lleva directo y no ocupan la fila de cocina.
            </span>
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 rounded-xl px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Guardando…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function AdminProductosPage() {
  const token = useAuthStore((state) => state.token);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productoParaImagen, setProductoParaImagen] = useState<string | null>(null);

  async function loadData() {
    if (!token) return;
    const [productosData, categoriasData] = await Promise.all([
      apiFetch<Producto[]>("/productos", { token }),
      apiFetch<Categoria[]>("/categorias", { token }),
    ]);
    setProductos(productosData);
    setCategorias(categoriasData);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate(values: ProductoFormValues) {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/productos", { method: "POST", token, body: JSON.stringify(values) });
      setCreating(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el producto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, values: ProductoFormValues) {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/productos/${id}`, { method: "PUT", token, body: JSON.stringify(values) });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el producto.");
    } finally {
      setSaving(false);
    }
  }

  function pedirImagen(productoId: string) {
    setProductoParaImagen(productoId);
    fileInputRef.current?.click();
  }

  async function handleArchivoSeleccionado(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !token || !productoParaImagen) return;
    setError(null);
    setUploadingId(productoParaImagen);
    try {
      await uploadFile(`/productos/${productoParaImagen}/imagen`, await reducirImagen(file), "imagen", token);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingId(null);
      setProductoParaImagen(null);
    }
  }

  async function handleToggleActive(producto: Producto) {
    if (!token) return;
    setError(null);
    try {
      if (producto.isActive) {
        await apiFetch(`/productos/${producto.id}`, { method: "DELETE", token });
      } else {
        await apiFetch(`/productos/${producto.id}`, { method: "PUT", token, body: JSON.stringify({ isActive: true }) });
      }
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado del producto.");
    }
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleArchivoSeleccionado} />
      {error ? <p className="text-sm text-peligro">{error}</p> : null}

      <div className="space-y-2">
        {productos.map((producto) =>
          editingId === producto.id ? (
            <div key={producto.id} className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
              <ProductoForm
                categorias={categorias}
                productos={productos.filter((p) => p.id !== producto.id)}
                submitLabel="Guardar cambios"
                loading={saving}
                initialValues={producto}
                onSubmit={(values) => handleUpdate(producto.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={producto.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3 bg-surface shadow-suave"
            >
              <div className="flex items-center gap-3">
                {resolverImagenUrl(producto.imagenUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolverImagenUrl(producto.imagenUrl)!}
                    alt={producto.nombre}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
                    Sin foto
                  </div>
                )}
                <div>
                  <p className="font-semibold">
                    {producto.nombre} {!producto.isActive ? <span className="text-muted-foreground">(inactivo)</span> : null}
                    {!producto.disponible ? <span className="ml-2 text-xs text-peligro">Agotado hoy</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {producto.categoria?.nombre} ·{" "}
                    {producto.esCombo
                      ? `Combo: ${producto.componentes?.map((c) => `${c.cantidad > 1 ? `${c.cantidad}× ` : ""}${c.producto.nombre}`).join(" + ")}`
                      : producto.requiereCocina
                        ? `${producto.tiempoPreparacionMinutos} min de preparación`
                        : "No pasa por cocina"}
                  </p>
                  <p className="text-sm font-semibold">
                    {formatoPesos(producto.precio)}
                    {producto.costo != null ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        costo {formatoPesos(producto.costo)} · margen{" "}
                        {producto.precio > 0 ? Math.round(((producto.precio - producto.costo) / producto.precio) * 100) : 0}%
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-aviso">sin costo</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => pedirImagen(producto.id)}
                  disabled={uploadingId === producto.id}
                  className="text-sm font-semibold text-accent disabled:opacity-50"
                >
                  {uploadingId === producto.id ? "Subiendo…" : "Subir imagen"}
                </button>
                <button onClick={() => setEditingId(producto.id)} className="text-sm font-semibold text-accent">
                  Editar
                </button>
                <button onClick={() => handleToggleActive(producto)} className="text-sm font-semibold text-peligro">
                  {producto.isActive ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <div className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
          <h2 className="text-base font-semibold tracking-tight">Nuevo producto</h2>
          <div className="mt-3">
            <ProductoForm categorias={categorias} productos={productos} submitLabel="Crear producto" loading={saving} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          disabled={categorias.length === 0}
          className="btn-primary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Nuevo producto
        </button>
      )}
    </div>
  );
}
