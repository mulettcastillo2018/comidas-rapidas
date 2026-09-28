"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";

interface Solicitud {
  motivo: string;
  error?: string;
  responder: (pin: string | null) => void;
}

function ModalClave({ solicitud, onCerrar }: { solicitud: Solicitud; onCerrar: () => void }) {
  const [pin, setPin] = useState("");

  function enviar(event: FormEvent) {
    event.preventDefault();
    solicitud.responder(pin);
    onCerrar();
  }

  function cancelar() {
    solicitud.responder(null);
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cancelar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="w-full max-w-xs space-y-3 rounded-2xl bg-background p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-accent" />
          <h2 className="font-bold">Autorización del administrador</h2>
        </div>
        <p className="text-sm text-muted-foreground">{solicitud.motivo}</p>
        <p className="text-xs text-muted-foreground">Un administrador debe digitar aquí su clave de supervisor.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="w-full rounded-lg border border-border px-3 py-2 text-center text-lg tracking-[0.5em]"
        />
        {solicitud.error ? <p className="text-xs text-red-600">{solicitud.error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={cancelar} className="flex-1 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground">
            Cancelar
          </button>
          <button type="submit" disabled={pin.length < 4} className="btn-primary flex-1 rounded-full px-3 py-2 text-sm disabled:opacity-50">
            Autorizar
          </button>
        </div>
      </form>
    </div>
  );
}

// Envuelve una acción que puede necesitar la clave de un admin (registrar
// que el cliente se fue sin pagar, cancelar algo que cocina ya empezó): si
// el servidor responde que falta autorización (428) o que la clave está mal,
// se la pide y reintenta. Devuelve null si se cancela.
export function useClaveSupervisor() {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);

  function pedirClave(motivo: string, error?: string) {
    return new Promise<string | null>((responder) => setSolicitud({ motivo, error, responder }));
  }

  async function conAutorizacion<T>(accion: (pin?: string) => Promise<T>): Promise<T | null> {
    let pin: string | undefined;
    let motivo = "";
    for (;;) {
      try {
        return await accion(pin);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        const faltaClave = err.status === 428;
        const claveIncorrecta = err.status === 403 && pin !== undefined && /clave/i.test(err.message);
        if (!faltaClave && !claveIncorrecta) throw err;
        if (faltaClave) motivo = err.message;
        const nueva = await pedirClave(motivo, claveIncorrecta ? err.message : undefined);
        if (nueva === null) return null;
        pin = nueva;
      }
    }
  }

  const modal = solicitud ? <ModalClave solicitud={solicitud} onCerrar={() => setSolicitud(null)} /> : null;
  return { conAutorizacion, modal };
}
