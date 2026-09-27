"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { Categoria, Producto } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

interface ProductoFormValues {
  nombre: string;
  descripcion: string;
  precio: number;
  tiempoPreparacionMinutos: number;
  categoriaId: string;
  imagenUrl: string | null;
  disponible: boolean;
  isActive: boolean;
}

const EMPTY_VALUES: Omit<ProductoFormValues, "categoriaId"> = {
  nombre: "",
  descripcion: "",
  precio: 0,
  tiempoPreparacionMinutos: 10,
  imagenUrl: null,
  disponible: true,
  isActive: true,
};

function ProductoForm({
  categorias,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  loading,
}: {
  categorias: Categoria[];
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
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <textarea
        value={values.descripcion}
        onChange={(e) => update("descripcion", e.target.value)}
        placeholder="Descripción"
        required
        rows={2}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          value={values.precio}
          onChange={(e) => update("precio", Number(e.target.value))}
          placeholder="Precio (COP)"
          required
          min={1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={values.tiempoPreparacionMinutos}
          onChange={(e) => update("tiempoPreparacionMinutos", Number(e.target.value))}
          placeholder="Tiempo de preparación (min)"
          required
          min={1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>
      <select
        value={values.categoriaId}
        onChange={(e) => update("categoriaId", e.target.value)}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
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
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={values.disponible} onChange={(e) => update("disponible", e.target.checked)} />
        Disponible hoy
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 rounded-full px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Guardando…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-6 py-2.5 text-sm text-muted-foreground"
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {productos.map((producto) =>
          editingId === producto.id ? (
            <div key={producto.id} className="rounded-xl border border-border p-4">
              <ProductoForm
                categorias={categorias}
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div>
                <p className="font-semibold">
                  {producto.nombre} {!producto.isActive ? <span className="text-muted-foreground">(inactivo)</span> : null}
                  {!producto.disponible ? <span className="ml-2 text-xs text-red-600">Agotado hoy</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {producto.categoria?.nombre} · {producto.tiempoPreparacionMinutos} min de preparación
                </p>
                <p className="text-sm font-semibold">{formatCOP(producto.precio)}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingId(producto.id)} className="text-sm font-semibold text-accent">
                  Editar
                </button>
                <button onClick={() => handleToggleActive(producto)} className="text-sm font-semibold text-red-600">
                  {producto.isActive ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-bold">Nuevo producto</h2>
          <div className="mt-3">
            <ProductoForm categorias={categorias} submitLabel="Crear producto" loading={saving} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          disabled={categorias.length === 0}
          className="btn-primary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Nuevo producto
        </button>
      )}
    </div>
  );
}
