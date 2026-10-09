"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Boton } from "@/components/ui";

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
    <div className="fixed inset-0 z-50 flex animate-aparecer items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm" onClick={cancelar}>
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-clave"
        className="w-full max-w-sm animate-emerger space-y-4 rounded-3xl bg-surface p-6 shadow-flotante ring-1 ring-border"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <h2 id="titulo-clave" className="font-semibold tracking-tight">
            Autorización del administrador
          </h2>
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
          aria-label="Clave de supervisor"
          className="h-14 w-full rounded-2xl border border-border bg-background text-center text-2xl tracking-[0.6em] tabular-nums transition-[border-color,box-shadow] duration-200 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none"
        />
        {solicitud.error ? <p className="text-xs font-medium text-peligro">{solicitud.error}</p> : null}
        <div className="flex gap-2">
          <Boton type="button" variante="secundario" className="flex-1" onClick={cancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="flex-1" disabled={pin.length < 4}>
            Autorizar
          </Boton>
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
