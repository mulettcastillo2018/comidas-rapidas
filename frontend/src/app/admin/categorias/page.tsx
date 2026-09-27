"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/categoryIcons";
import type { Categoria } from "@/lib/types";

function IconPicker({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  return (
    <div className="grid max-h-32 w-full grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-8">
      {CATEGORY_ICON_OPTIONS.map((name) => {
        const OptionIcon = getCategoryIcon(name);
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              selected ? "bg-accent text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <OptionIcon size={16} />
          </button>
        );
      })}
    </div>
  );
}

export default function AdminCategoriasPage() {
  const token = useAuthStore((state) => state.token);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadCategorias() {
    if (!token) return;
    const data = await apiFetch<Categoria[]>("/categorias", { token });
    setCategorias(data);
  }

  useEffect(() => {
    loadCategorias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function startEditing(categoria: Categoria) {
    setEditingId(categoria.id);
    setEditIcon(categoria.icono);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    try {
      await apiFetch("/categorias", {
        method: "POST",
        token,
        body: JSON.stringify({ nombre: field("nombre"), slug: field("slug"), icono: newIcon }),
      });
      form.reset();
      setNewIcon(null);
      await loadCategorias();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la categoría.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    try {
      await apiFetch(`/categorias/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ nombre: field("nombre"), slug: field("slug"), icono: editIcon }),
      });
      setEditingId(null);
      await loadCategorias();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la categoría.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm("¿Eliminar esta categoría? Esto puede fallar si tiene productos asociados.")) return;
    setError(null);
    try {
      await apiFetch(`/categorias/${id}`, { method: "DELETE", token });
      await loadCategorias();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la categoría.");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {categorias.map((categoria) => {
          const CategoriaIcon = getCategoryIcon(categoria.icono);
          return editingId === categoria.id ? (
            <form
              key={categoria.id}
              onSubmit={(e) => handleUpdate(categoria.id, e)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <CategoriaIcon size={22} />
              </span>
              <input
                name="nombre"
                defaultValue={categoria.nombre}
                required
                className="w-full rounded-lg border border-border px-2 py-1 text-sm"
              />
              <input
                name="slug"
                defaultValue={categoria.slug}
                required
                className="w-full rounded-lg border border-border px-2 py-1 text-sm"
              />
              <IconPicker value={editIcon} onChange={setEditIcon} />
              <div className="flex w-full gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-full px-3 py-1 text-sm">
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex-1 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div
              key={categoria.id}
              className="flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <CategoriaIcon size={22} />
              </span>
              <p className="line-clamp-2 text-sm font-semibold">{categoria.nombre}</p>
              <p className="text-xs text-muted-foreground">{categoria.slug}</p>
              <div className="mt-1 flex gap-3">
                <button onClick={() => startEditing(categoria)} className="text-xs font-semibold text-accent">
                  Editar
                </button>
                <button onClick={() => handleDelete(categoria.id)} className="text-xs font-semibold text-red-600">
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">Nueva categoría</h2>
        <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-start gap-2">
          <input name="nombre" placeholder="Nombre" required className="rounded-lg border border-border px-2 py-1 text-sm" />
          <input name="slug" placeholder="slug" required className="rounded-lg border border-border px-2 py-1 text-sm" />
          <div className="w-full max-w-xs sm:w-64">
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary rounded-full px-4 py-1 text-sm">
            {saving ? "Guardando…" : "Crear"}
          </button>
        </form>
      </div>
    </div>
  );
}
