"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

// Cada admin define su propia clave de supervisor: con ella autoriza, en el
// celular del mesero, registrar que un cliente se fue sin pagar o cancelar
// algo que cocina ya empezó. Queda registrado quién autorizó.
export function MiClaveSupervisor({ token, tienePin, onCambio }: { token: string; tienePin: boolean; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (pin !== confirmacion) {
      setError("Las dos claves no coinciden.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/usuarios/me/pin", { method: "PUT", token, body: JSON.stringify({ pin }) });
      setEditando(false);
      setPin("");
      setConfirmacion("");
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la clave.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!confirm("¿Quitar tu clave de supervisor? Ya no podrás autorizar desde el celular de los meseros.")) return;
    await apiFetch("/usuarios/me/pin", { method: "PUT", token, body: JSON.stringify({ pin: null }) });
    onCambio();
  }

  return (
    <section className="rounded-2xl border border-border p-4 text-sm bg-surface shadow-suave">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className={tienePin ? "text-exito" : "text-aviso"} />
          <div>
            <p className="font-semibold">Mi clave de supervisor</p>
            <p className="text-xs text-muted-foreground">
              {tienePin
                ? "Configurada. Con ella autorizas en el celular del mesero lo que no debe hacer solo."
                : "Sin configurar: los meseros no podrán registrar cuentas perdidas ni cancelar lo que cocina ya empezó."}
            </p>
          </div>
        </div>
        {!editando ? (
          <span className="flex gap-3">
            <button onClick={() => setEditando(true)} className="text-xs font-semibold text-accent">
              {tienePin ? "Cambiar" : "Configurar"}
            </button>
            {tienePin ? (
              <button onClick={quitar} className="text-xs font-semibold text-peligro">
                Quitar
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {editando ? (
        <form onSubmit={guardar} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Nueva clave (4 a 6 números)"
            className="w-48 rounded-xl border border-border px-2 py-1.5"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value.replace(/\D/g, ""))}
            placeholder="Repítela"
            className="w-36 rounded-xl border border-border px-2 py-1.5"
          />
          <button type="submit" disabled={guardando || pin.length < 4} className="btn-primary rounded-xl px-4 py-1.5 text-xs disabled:opacity-50">
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-xs text-muted-foreground">
            Cancelar
          </button>
          {error ? <p className="w-full text-xs text-peligro">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
