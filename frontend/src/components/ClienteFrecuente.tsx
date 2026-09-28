"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import { consultarPrograma, type ClienteDeCuenta, type ClienteFrecuente as Cliente, type ProgramaPuntos } from "@/lib/clientes";
import { useAuthStore } from "@/store/auth.store";

// Identifica al cliente frecuente por su celular (o lo registra) para que
// acumule puntos; donde se permite, también canjea puntos como descuento.
export function ClienteFrecuente({
  permitirCanje = false,
  maximoCanjePesos,
  onCambio,
}: {
  permitirCanje?: boolean;
  // El canje no puede pasar de lo que vale la cuenta.
  maximoCanjePesos?: number;
  onCambio: (c: ClienteDeCuenta | null) => void;
}) {
  const token = useAuthStore((state) => state.token);
  const [programa, setPrograma] = useState<ProgramaPuntos | null>(null);
  const [telefono, setTelefono] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [nombre, setNombre] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [canjear, setCanjear] = useState(false);
  const [puntos, setPuntos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) consultarPrograma(token, (ruta, t) => apiFetch<ProgramaPuntos>(ruta, { token: t })).then(setPrograma);
  }, [token]);

  // Máximo canjeable: los puntos del cliente, sin pasar del valor de la cuenta.
  const maximoPuntos = cliente && programa ? Math.min(cliente.puntos, Math.floor((maximoCanjePesos ?? Infinity) / programa.valorPunto)) : 0;
  const puedeCanjear = permitirCanje && Boolean(programa) && Boolean(cliente) && maximoPuntos >= (programa?.minimoCanje ?? Infinity);

  useEffect(() => {
    if (!cliente) return onCambio(null);
    const aCanjear = canjear && puedeCanjear && puntos > 0 ? Math.min(puntos, maximoPuntos) : 0;
    onCambio({ clienteId: cliente.id, ...(aCanjear ? { canjearPuntos: aCanjear, valorCanje: aCanjear * (programa?.valorPunto ?? 0) } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, canjear, puntos, maximoPuntos]);

  if (!programa?.activo) return null;

  async function buscar() {
    setError(null);
    setNoExiste(false);
    try {
      const c = await apiFetch<Cliente>(`/clientes/buscar?telefono=${encodeURIComponent(telefono)}`, { token });
      setCliente(c);
      setPuntos(Math.min(c.puntos, maximoPuntos || c.puntos));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNoExiste(true);
      else setError(err instanceof ApiError ? err.message : "No se pudo buscar el cliente.");
    }
  }

  async function registrar() {
    setError(null);
    try {
      const c = await apiFetch<Cliente>("/clientes", { method: "POST", token, body: JSON.stringify({ telefono, nombre: nombre.trim(), autoriza }) });
      setCliente(c);
      setNoExiste(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cliente.");
    }
  }

  function quitar() {
    setCliente(null);
    setTelefono("");
    setCanjear(false);
    setNoExiste(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2 text-xs">
      <p className="font-semibold">⭐ Cliente frecuente (puntos)</p>
      {cliente ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>
              <strong>{cliente.nombre}</strong> · {cliente.puntos} puntos ({formatoPesos(cliente.valorPuntos)})
            </span>
            <button onClick={quitar} className="text-muted-foreground">
              Quitar
            </button>
          </div>
          {puedeCanjear ? (
            <label className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={canjear} onChange={(e) => setCanjear(e.target.checked)} />
              Canjear
              <input
                type="number"
                min={programa.minimoCanje}
                max={maximoPuntos}
                value={puntos}
                onChange={(e) => setPuntos(Math.max(0, Math.min(maximoPuntos, Math.round(Number(e.target.value) || 0))))}
                className="w-20 rounded border border-border px-1 py-0.5"
              />
              puntos = −{formatoPesos(Math.min(puntos, maximoPuntos) * programa.valorPunto)}
            </label>
          ) : permitirCanje && cliente.puntos > 0 ? (
            <p className="text-muted-foreground">Puede canjear desde {programa.minimoCanje} puntos.</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/[^\d+ ]/g, ""))}
              placeholder="Celular del cliente"
              inputMode="tel"
              className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1"
            />
            <button onClick={buscar} disabled={telefono.replace(/\D/g, "").length < 10} className="rounded-full border border-accent px-3 py-1 font-semibold text-accent disabled:opacity-50">
              Buscar
            </button>
          </div>
          {noExiste ? (
            <div className="space-y-1.5">
              <p className="text-muted-foreground">No está registrado. ¿Lo inscribimos?</p>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="w-full rounded-lg border border-border px-2 py-1" />
              <label className="flex items-start gap-2 leading-snug text-muted-foreground">
                <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} className="mt-0.5" />
                El cliente autoriza guardar su nombre y celular para el programa de puntos (Ley 1581 de 2012). Puede pedir que se borren cuando quiera.
              </label>
              <button onClick={registrar} disabled={!autoriza || nombre.trim().length < 2} className="btn-primary rounded-full px-3 py-1 disabled:opacity-50">
                Registrar
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Gana 1 punto por cada {formatoPesos(programa.pesosPorPunto)}; cada punto vale {formatoPesos(programa.valorPunto)}.
            </p>
          )}
        </>
      )}
      {error ? <p className="text-red-600">{error}</p> : null}
    </div>
  );
}
