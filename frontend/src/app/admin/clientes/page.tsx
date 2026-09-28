"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import type { ClienteAdmin, MovimientoPuntos } from "@/lib/clientes";

interface Lista {
  clientes: ClienteAdmin[];
  resumen: { clientes: number; puntosPendientes: number; valorPuntosPendientes: number; cuentasConCliente: number; cuentas: number };
}

interface ConfigPuntos {
  propinaPctCocina: number;
  propinaModo: "PROPIAS" | "POZO";
  puntosActivo: boolean;
  pesosPorPunto: number;
  valorPunto: number;
  minimoCanje: number;
}

const TIPO = { ACUMULADO: "Compra", CANJE: "Canje", DEVOLUCION: "Devolución", AJUSTE: "Ajuste" } as const;

export default function AdminClientesPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [buscar, setBuscar] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [config, setConfig] = useState<ConfigPuntos | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoPuntos[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!token) return;
    apiFetch<Lista>(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ""}`, { token })
      .then(setLista)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar los clientes."));
  }, [token, buscar]);

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);
  useEffect(() => {
    if (token) apiFetch<ConfigPuntos>("/configuracion", { token }).then(setConfig);
  }, [token]);

  async function guardarConfig(cambio: Partial<ConfigPuntos>) {
    if (!token || !config) return;
    setError(null);
    try {
      setConfig(await apiFetch<ConfigPuntos>("/configuracion", { method: "PUT", token, body: JSON.stringify({ ...config, ...cambio }) }));
      showToast("Programa de puntos actualizado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function verMovimientos(id: string) {
    if (!token) return;
    if (abierto === id) return setAbierto(null);
    setAbierto(id);
    setMovimientos(await apiFetch<MovimientoPuntos[]>(`/clientes/${id}/movimientos`, { token }));
  }

  async function ajustar(c: ClienteAdmin) {
    if (!token) return;
    const valor = prompt(`Puntos a sumar a ${c.nombre} (negativo para quitar):`);
    if (!valor) return;
    const nota = prompt("¿Por qué?") ?? "";
    try {
      await apiFetch(`/clientes/${c.id}/ajuste`, { method: "POST", token, body: JSON.stringify({ puntos: Math.round(Number(valor)), nota }) });
      showToast("Puntos ajustados");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo ajustar.");
    }
  }

  async function eliminar(c: ClienteAdmin) {
    if (!token || !confirm(`¿Borrar los datos de ${c.nombre}? Sus compras quedan, pero sin nombre ni celular. Pierde sus ${c.puntos} puntos.`)) return;
    try {
      await apiFetch(`/clientes/${c.id}`, { method: "DELETE", token });
      showToast("Datos del cliente eliminados");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    }
  }

  if (!token) return null;
  const r = lista?.resumen;

  return (
    <div className="space-y-6">
      {config ? (
        <section className="space-y-2 rounded-xl border border-border p-4 text-sm">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={config.puntosActivo} onChange={(e) => guardarConfig({ puntosActivo: e.target.checked })} />
            Programa de puntos activo
          </label>
          <div className="flex flex-wrap items-center gap-2">
            1 punto por cada
            <input
              type="number"
              min={100}
              step={100}
              defaultValue={config.pesosPorPunto}
              onBlur={(e) => Number(e.target.value) !== config.pesosPorPunto && guardarConfig({ pesosPorPunto: Math.round(Number(e.target.value)) })}
              className="w-24 rounded-lg border border-border px-2 py-1"
            />
            pesos · cada punto vale
            <input
              type="number"
              min={1}
              defaultValue={config.valorPunto}
              onBlur={(e) => Number(e.target.value) !== config.valorPunto && guardarConfig({ valorPunto: Math.round(Number(e.target.value)) })}
              className="w-20 rounded-lg border border-border px-2 py-1"
            />
            pesos · se canjean desde
            <input
              type="number"
              min={1}
              defaultValue={config.minimoCanje}
              onBlur={(e) => Number(e.target.value) !== config.minimoCanje && guardarConfig({ minimoCanje: Math.round(Number(e.target.value)) })}
              className="w-20 rounded-lg border border-border px-2 py-1"
            />
            puntos
          </div>
          <p className="text-xs text-muted-foreground">
            Con {formatoPesos(config.pesosPorPunto)} por punto y {formatoPesos(config.valorPunto)} por punto al canjear, el cliente recibe de vuelta el{" "}
            {Math.round((config.valorPunto / config.pesosPorPunto) * 1000) / 10}% de lo que compra.
          </p>
        </section>
      ) : null}

      {r ? (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Clientes inscritos</p>
            <p className="text-xl font-extrabold">{r.clientes}</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Puntos sin canjear</p>
            <p className="text-xl font-extrabold">{r.puntosPendientes.toLocaleString("es-CO")}</p>
            <p className="text-xs text-muted-foreground">equivalen a {formatoPesos(r.valorPuntosPendientes)} en descuentos</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Cuentas con cliente identificado</p>
            <p className="text-xl font-extrabold">{r.cuentas > 0 ? Math.round((r.cuentasConCliente / r.cuentas) * 100) : 0}%</p>
            <p className="text-xs text-muted-foreground">últimos 30 días</p>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o celular" className="w-full max-w-sm rounded-lg border border-border px-3 py-2 text-sm" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!lista ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : lista.clientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay clientes {buscar ? "que coincidan" : "inscritos todavía"}.</p>
        ) : (
          <ul className="space-y-2">
            {lista.clientes.map((c) => (
              <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.telefono} · {c.visitas} visita(s) · compró {formatoPesos(c.totalGastado)}
                      {c.ultimaVisita ? ` · última ${formatoFechaHora(c.ultimaVisita)}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">⭐ {c.puntos}</span>
                </div>
                <div className="mt-2 flex gap-3 text-xs">
                  <button onClick={() => verMovimientos(c.id)} className="text-accent">
                    Movimientos
                  </button>
                  <button onClick={() => ajustar(c)} className="text-accent">
                    Ajustar puntos
                  </button>
                  <button onClick={() => eliminar(c)} className="text-red-600">
                    Borrar sus datos
                  </button>
                </div>
                {abierto === c.id ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {movimientos.length === 0 ? <li>Sin movimientos.</li> : null}
                    {movimientos.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span>
                          {formatoFechaHora(m.creadoEn)} · {TIPO[m.tipo]}
                          {m.nota ? ` (${m.nota})` : ""}
                          {m.usuario ? ` · ${m.usuario}` : ""}
                        </span>
                        <span className={m.puntos < 0 ? "text-red-600" : "text-green-700"}>
                          {m.puntos > 0 ? "+" : ""}
                          {m.puntos} → {m.saldo}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
