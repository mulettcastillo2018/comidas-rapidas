"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { SelectorProductos } from "./SelectorProductos";
import type { Categoria, Producto } from "@/lib/types";

export interface PromocionAdmin {
  id: string;
  nombre: string;
  descuentoPct: number;
  activa: boolean;
  diasSemana: number[];
  horaInicio: string | null;
  horaFin: string | null;
  productoIds: string[];
  categoriaIds: string[];
  vigente: boolean;
}

const DIAS = [
  { n: 1, corto: "Lun" },
  { n: 2, corto: "Mar" },
  { n: 3, corto: "Mié" },
  { n: 4, corto: "Jue" },
  { n: 5, corto: "Vie" },
  { n: 6, corto: "Sáb" },
  { n: 0, corto: "Dom" },
];

function describir(p: PromocionAdmin) {
  const dias = p.diasSemana.length === 0 || p.diasSemana.length === 7 ? "todos los días" : DIAS.filter((d) => p.diasSemana.includes(d.n)).map((d) => d.corto).join(", ");
  const horario = p.horaInicio || p.horaFin ? ` de ${p.horaInicio ?? "00:00"} a ${p.horaFin ?? "24:00"}` : "";
  return `${dias}${horario}`;
}

function Formulario({
  inicial,
  productos,
  categorias,
  onGuardar,
  onCancelar,
}: {
  inicial?: PromocionAdmin;
  productos: Producto[];
  categorias: Categoria[];
  onGuardar: (datos: Omit<PromocionAdmin, "id" | "vigente">) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [descuentoPct, setDescuentoPct] = useState(inicial?.descuentoPct ?? 10);
  const [dias, setDias] = useState<number[]>(inicial?.diasSemana ?? []);
  const [horaInicio, setHoraInicio] = useState(inicial?.horaInicio ?? "");
  const [horaFin, setHoraFin] = useState(inicial?.horaFin ?? "");
  const [productoIds, setProductoIds] = useState<string[]>(inicial?.productoIds ?? []);
  const [categoriaIds, setCategoriaIds] = useState<string[]>(inicial?.categoriaIds ?? []);

  function enviar(event: FormEvent) {
    event.preventDefault();
    onGuardar({
      nombre: nombre.trim(),
      descuentoPct,
      activa: inicial?.activa ?? true,
      diasSemana: dias,
      horaInicio: horaInicio || null,
      horaFin: horaFin || null,
      productoIds,
      categoriaIds,
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-border p-3 text-sm bg-surface shadow-suave">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="font-semibold">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} placeholder="Hora feliz, Martes de perros…" className="mt-1 w-full rounded-xl border border-border px-2 py-2" />
        </label>
        <label className="block">
          <span className="font-semibold">Descuento (%)</span>
          <input type="number" min={1} max={100} value={descuentoPct} onChange={(e) => setDescuentoPct(Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))))} className="mt-1 w-full rounded-xl border border-border px-2 py-2" />
        </label>
      </div>
      <div>
        <p className="text-xs font-semibold">Días (ninguno = todos los días)</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DIAS.map((d) => (
            <button
              key={d.n}
              type="button"
              onClick={() => setDias((prev) => (prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n]))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${dias.includes(d.n) ? "btn-primary" : "bg-muted text-muted-foreground"}`}
            >
              {d.corto}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="block">
          <span className="font-semibold">Desde la hora</span>
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="mt-1 block rounded-xl border border-border px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="font-semibold">Hasta la hora</span>
          <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="mt-1 block rounded-xl border border-border px-2 py-1.5" />
        </label>
        <span className="text-muted-foreground">Sin horas = todo el día. Hora de Colombia.</span>
      </div>
      <div>
        <p className="text-xs font-semibold">Categorías completas</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {categorias.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={categoriaIds.includes(c.id)}
                onChange={() => setCategoriaIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
              />
              {c.nombre}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold">…o productos puntuales</p>
        <SelectorProductos productos={productos} elegidos={productoIds} onChange={setProductoIds} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!nombre.trim() || productoIds.length + categoriaIds.length === 0} className="btn-primary rounded-xl px-4 py-1.5 text-xs disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="text-xs text-muted-foreground">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Descuentos por horario (hora feliz, martes de perros): se aplican solos al
// pedir y la carta muestra el precio rebajado mientras están vigentes.
export function PromocionesAdmin({
  token,
  promociones,
  productos,
  categorias,
  onCambio,
}: {
  token: string;
  promociones: PromocionAdmin[];
  productos: Producto[];
  categorias: Categoria[];
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(id: string | null, datos: Omit<PromocionAdmin, "id" | "vigente">) {
    setError(null);
    try {
      await apiFetch(id ? `/promociones/${id}` : "/promociones", { method: id ? "PUT" : "POST", token, body: JSON.stringify(datos) });
      setEditando(null);
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la promoción.");
    }
  }

  async function alternarActiva(p: PromocionAdmin) {
    const { id: _id, vigente: _v, ...datos } = p;
    await apiFetch(`/promociones/${p.id}`, { method: "PUT", token, body: JSON.stringify({ ...datos, activa: !p.activa }) });
    onCambio();
  }

  async function borrar(p: PromocionAdmin) {
    if (!confirm(`¿Borrar la promoción "${p.nombre}"? Las ventas ya hechas conservan su precio.`)) return;
    await apiFetch(`/promociones/${p.id}`, { method: "DELETE", token });
    onCambio();
  }

  const nombres = (p: PromocionAdmin) =>
    [...categorias.filter((c) => p.categoriaIds.includes(c.id)).map((c) => `toda la categoría ${c.nombre}`), ...productos.filter((x) => p.productoIds.includes(x.id)).map((x) => x.nombre)].join(", ");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Promociones</h2>
          <p className="text-xs text-muted-foreground">Se aplican solas al pedir, en los días y horas que indiques.</p>
        </div>
        {editando === null ? (
          <button onClick={() => setEditando("nueva")} className="btn-primary rounded-xl px-3 py-1.5 text-xs">
            + Nueva promoción
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-peligro">{error}</p> : null}
      {editando === "nueva" ? <Formulario productos={productos} categorias={categorias} onGuardar={(d) => guardar(null, d)} onCancelar={() => setEditando(null)} /> : null}
      {promociones.length === 0 && editando !== "nueva" ? <p className="text-sm text-muted-foreground">Todavía no hay promociones.</p> : null}
      {promociones.map((p) =>
        editando === p.id ? (
          <Formulario key={p.id} inicial={p} productos={productos} categorias={categorias} onGuardar={(d) => guardar(p.id, d)} onCancelar={() => setEditando(null)} />
        ) : (
          <div key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-sm bg-surface shadow-suave ${p.vigente ? "border-exito" : "border-border"} ${p.activa ? "" : "opacity-60"}`}>
            <div className="min-w-0">
              <p className="font-semibold">
                {p.nombre} · −{p.descuentoPct}%
                {p.vigente ? <span className="ml-2 rounded-full bg-exito/10 px-2 py-0.5 text-[10px] font-semibold text-exito">aplicando ahora</span> : null}
                {!p.activa ? <span className="ml-2 text-xs text-muted-foreground">(pausada)</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {describir(p)} · {nombres(p)}
              </p>
            </div>
            <span className="flex items-center gap-3 text-xs font-semibold">
              <button onClick={() => setEditando(p.id)} className="text-accent">
                Editar
              </button>
              <button onClick={() => alternarActiva(p)} className="text-muted-foreground">
                {p.activa ? "Pausar" : "Activar"}
              </button>
              <button onClick={() => borrar(p)} className="text-peligro" title="Borrar">
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        )
      )}
    </section>
  );
}
