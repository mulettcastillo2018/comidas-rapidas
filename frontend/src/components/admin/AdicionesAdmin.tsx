"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import { CampoPesos } from "@/components/CampoPesos";
import { SelectorProductos } from "./SelectorProductos";
import type { Producto } from "@/lib/types";

export interface AdicionAdmin {
  id: string;
  nombre: string;
  precio: number;
  costo?: number | null;
  activa: boolean;
  productoIds: string[];
}

function Formulario({
  inicial,
  productos,
  onGuardar,
  onCancelar,
}: {
  inicial?: AdicionAdmin;
  productos: Producto[];
  onGuardar: (datos: Omit<AdicionAdmin, "id">) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [precio, setPrecio] = useState<number | null>(inicial?.precio ?? 0);
  const [costo, setCosto] = useState<number | null>(inicial?.costo ?? null);
  const [productoIds, setProductoIds] = useState<string[]>(inicial?.productoIds ?? []);

  function enviar(event: FormEvent) {
    event.preventDefault();
    onGuardar({ nombre: nombre.trim(), precio: precio ?? 0, costo, activa: inicial?.activa ?? true, productoIds });
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-xl border border-border p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="font-semibold">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} placeholder="Extra queso, Sin cebolla…" className="mt-1 w-full rounded-lg border border-border px-2 py-2" />
        </label>
        <CampoPesos label="Precio para el cliente" ayuda="0 si no cobra nada" valor={precio} onChange={setPrecio} />
        <CampoPesos label="Costo" ayuda="Opcional" valor={costo} onChange={setCosto} />
      </div>
      <div>
        <p className="text-xs font-semibold">¿A qué productos se le puede poner?</p>
        <SelectorProductos productos={productos.filter((p) => !p.esCombo)} elegidos={productoIds} onChange={setProductoIds} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!nombre.trim()} className="btn-primary rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="text-xs text-muted-foreground">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Adiciones con precio (extra queso) o sin él (sin cebolla, término medio):
// el mesero y el cliente las eligen en vez de escribirlas como nota, y las
// que tienen precio se cobran.
export function AdicionesAdmin({ token, adiciones, productos, onCambio }: { token: string; adiciones: AdicionAdmin[]; productos: Producto[]; onCambio: () => void }) {
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(id: string | null, datos: Omit<AdicionAdmin, "id">) {
    setError(null);
    try {
      await apiFetch(id ? `/adiciones/${id}` : "/adiciones", { method: id ? "PUT" : "POST", token, body: JSON.stringify(datos) });
      setEditando(null);
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la adición.");
    }
  }

  async function alternarActiva(a: AdicionAdmin) {
    await apiFetch(`/adiciones/${a.id}`, { method: "PUT", token, body: JSON.stringify({ activa: !a.activa }) });
    onCambio();
  }

  const nombreProducto = (id: string) => productos.find((p) => p.id === id)?.nombre ?? "—";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Adiciones</h2>
          <p className="text-xs text-muted-foreground">Extras con precio (se cobran solos) u opciones sin costo, por producto.</p>
        </div>
        {editando === null ? (
          <button onClick={() => setEditando("nueva")} className="btn-primary rounded-full px-3 py-1.5 text-xs">
            + Nueva adición
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {editando === "nueva" ? <Formulario productos={productos} onGuardar={(d) => guardar(null, d)} onCancelar={() => setEditando(null)} /> : null}
      {adiciones.length === 0 && editando !== "nueva" ? <p className="text-sm text-muted-foreground">Todavía no hay adiciones.</p> : null}
      {adiciones.map((a) =>
        editando === a.id ? (
          <Formulario key={a.id} inicial={a} productos={productos} onGuardar={(d) => guardar(a.id, d)} onCancelar={() => setEditando(null)} />
        ) : (
          <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm ${a.activa ? "" : "opacity-60"}`}>
            <div>
              <p className="font-semibold">
                {a.nombre} <span className="font-normal text-muted-foreground">· {a.precio > 0 ? `+${formatoPesos(a.precio)}` : "sin costo"}</span>
                {!a.activa ? <span className="ml-2 text-xs text-muted-foreground">(inactiva)</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.productoIds.length > 0 ? a.productoIds.map(nombreProducto).join(", ") : "Sin productos asignados"}
              </p>
            </div>
            <span className="flex gap-3 text-xs font-semibold">
              <button onClick={() => setEditando(a.id)} className="text-accent">
                Editar
              </button>
              <button onClick={() => alternarActiva(a)} className="text-muted-foreground">
                {a.activa ? "Desactivar" : "Activar"}
              </button>
            </span>
          </div>
        )
      )}
    </section>
  );
}
