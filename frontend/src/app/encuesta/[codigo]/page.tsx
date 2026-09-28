"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface EstadoEncuesta {
  contexto: string;
  yaRespondida: boolean;
}

const ETIQUETAS = ["", "Muy mal", "Mal", "Regular", "Bien", "¡Excelente!"];

// Pública (sin login): la abre el cliente desde el QR de la precuenta o desde
// la página de seguimiento de su pedido.
export default function EncuestaPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [estado, setEstado] = useState<EstadoEncuesta | null>(null);
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EstadoEncuesta>(`/encuestas/${codigo}`)
      .then(setEstado)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la encuesta."));
  }, [codigo]);

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (calificacion === 0) return;
    setEnviando(true);
    setError(null);
    try {
      await apiFetch(`/encuestas/${codigo}`, { method: "POST", body: JSON.stringify({ calificacion, comentario: comentario.trim() || undefined }) });
      setEnviada(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <h1 className="brand-gradient-text text-2xl font-extrabold tracking-tight">Comidas Rápidas</h1>
      {!estado ? (
        <p className="mt-10 text-sm text-muted-foreground">{error ?? "Cargando…"}</p>
      ) : enviada || estado.yaRespondida ? (
        <div className="mt-10 space-y-2">
          <p className="text-4xl">🙏</p>
          <p className="text-lg font-bold">¡Gracias por tu opinión!</p>
          <p className="text-sm text-muted-foreground">Nos ayuda a mejorar cada día.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-6 space-y-5">
          <div>
            <p className="text-lg font-bold">¿Cómo te atendimos?</p>
            <p className="text-sm text-muted-foreground">{estado.contexto}</p>
          </div>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setCalificacion(n)} aria-label={`${n} estrellas`} className="p-1">
                <Star size={36} className={n <= calificacion ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
              </button>
            ))}
          </div>
          <p className="h-5 text-sm font-semibold">{ETIQUETAS[calificacion]}</p>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={calificacion > 0 && calificacion <= 3 ? "¿Qué podemos mejorar?" : "Cuéntanos algo más (opcional)"}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button type="submit" disabled={calificacion === 0 || enviando} className="btn-primary w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-50">
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </form>
      )}
    </div>
  );
}
