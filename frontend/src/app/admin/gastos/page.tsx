"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { activas, conAlcance, nombreActual, useSedes, useVerTodas } from "@/lib/sedes";
import { AlcanceSedes } from "@/components/SelectorSede";
import { formatoPesos, hoyLocal } from "@/lib/formato";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { CampoPesos } from "@/components/CampoPesos";
import { SelectorRango } from "@/components/reportes/SelectorRango";
import { CATEGORIA_GASTO_LABEL, CATEGORIAS_FIJAS, CATEGORIAS_GASTO, type CategoriaGasto, type ListaGastos } from "@/lib/gestion";

function nombreDia(dia: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`));
}

export default function AdminGastosPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy);
  const [lista, setLista] = useState<ListaGastos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todas = useVerTodas();
  const sedes = useSedes();
  const variasSedes = activas(sedes).length > 1;
  // Solo el administrador general registra gastos del negocio en general.
  const [general, setGeneral] = useState(false);

  const [dia, setDia] = useState(hoy);
  const [categoria, setCategoria] = useState<CategoriaGasto>("INSUMOS");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
  const [esFijo, setEsFijo] = useState(false);
  const [desdeCaja, setDesdeCaja] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    if (!token) return;
    apiFetch<ListaGastos>(conAlcance(`/gastos?desde=${desde}&hasta=${hasta}`, todas), { token })
      .then(setLista)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar los gastos."));
  }, [token, desde, hasta, todas]);

  useEffect(cargar, [cargar]);

  function elegirCategoria(c: CategoriaGasto) {
    setCategoria(c);
    setEsFijo(CATEGORIAS_FIJAS.includes(c));
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!token || !monto) return;
    setError(null);
    setGuardando(true);
    try {
      await apiFetch("/gastos", { method: "POST", token, body: JSON.stringify({ dia, categoria, concepto: concepto.trim(), monto, esFijo, desdeCaja, general }) });
      showToast(desdeCaja ? "Gasto registrado y descontado de la caja" : "Gasto registrado");
      setConcepto("");
      setMonto(null);
      setDesdeCaja(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    if (!token || !confirm("¿Borrar este gasto? Si salió de la caja, también se borra esa salida.")) return;
    try {
      await apiFetch(`/gastos/${id}`, { method: "DELETE", token });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar el gasto.");
    }
  }

  if (!token) return null;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Lo que pagas para operar. Con esto, Reportes → Resultados te dice cuánto te queda de verdad y cuánto necesitas vender
        para no perder.
      </p>

      <form onSubmit={guardar} className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">
          Registrar un gasto{variasSedes ? (general ? " del negocio en general" : ` de ${nombreActual(sedes)}`) : ""}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-semibold">Categoría</span>
            <select value={categoria} onChange={(e) => elegirCategoria(e.target.value as CategoriaGasto)} className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm">
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_GASTO_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">Fecha</span>
            <input
              type="date"
              value={dia}
              max={hoy}
              onChange={(e) => {
                setDia(e.target.value);
                // Solo un gasto de hoy puede salir de la caja.
                if (e.target.value !== hoy) setDesdeCaja(false);
              }}
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Concepto</span>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. 20 kg de carne, recibo de la luz"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <CampoPesos label="Valor" valor={monto} onChange={setMonto} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={esFijo} onChange={(e) => setEsFijo(e.target.checked)} />
            Es fijo (se paga igual se venda o no)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={desdeCaja} disabled={dia !== hoy || general} onChange={(e) => setDesdeCaja(e.target.checked)} />
            Se pagó con efectivo de la caja{dia !== hoy ? " (solo gastos de hoy)" : ""}
          </label>
          {variasSedes && sedes?.puedeCambiar ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={general}
                onChange={(e) => {
                  setGeneral(e.target.checked);
                  if (e.target.checked) setDesdeCaja(false);
                }}
              />
              Es del negocio en general, no de una sede (p. ej. contador, publicidad de la marca)
            </label>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button disabled={guardando || !monto || concepto.trim().length < 3} className="btn-primary rounded-full px-5 py-2 text-sm disabled:opacity-50">
          {guardando ? "Guardando…" : "Registrar gasto"}
        </button>
      </form>

      <section className="space-y-4">
        <AlcanceSedes />
        <SelectorRango
          desde={desde}
          hasta={hasta}
          onCambio={(d, h) => {
            setDesde(d);
            setHasta(h);
          }}
        />
        {!lista ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : lista.gastos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados en estas fechas.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground">Total de gastos</p>
                <p className="mt-1 text-xl font-extrabold">{formatoPesos(lista.total)}</p>
              </div>
              <div className="rounded-xl border border-border p-4 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Por categoría</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {lista.porCategoria.map((c) => (
                    <li key={c.categoria} className="flex justify-between gap-2">
                      <span>{CATEGORIA_GASTO_LABEL[c.categoria]}</span>
                      <span className="font-semibold">{formatoPesos(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-1.5 pr-4">Fecha</th>
                    <th className="py-1.5 pr-4">Concepto</th>
                    <th className="py-1.5 pr-4">Categoría</th>
                    <th className="py-1.5 pr-4 text-right">Valor</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {lista.gastos.map((g) => (
                    <tr key={g.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-4 text-xs capitalize text-muted-foreground">{nombreDia(g.dia)}</td>
                      <td className="py-1.5 pr-4">
                        {g.concepto}
                        <span className="block text-[11px] text-muted-foreground">
                          {[todas ? (g.sede ?? "general") : null, g.esFijo ? "fijo" : null, g.desdeCaja ? "salió de la caja" : null, `registró ${g.registradoPor}`].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4 text-xs">{CATEGORIA_GASTO_LABEL[g.categoria]}</td>
                      <td className="py-1.5 pr-4 text-right font-semibold">{formatoPesos(g.monto)}</td>
                      <td className="py-1.5 text-right">
                        {g.enCierre ? (
                          <span className="text-[10px] text-muted-foreground" title="Ya está en un cierre de caja">
                            cerrado
                          </span>
                        ) : (
                          <button onClick={() => borrar(g.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar gasto">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
