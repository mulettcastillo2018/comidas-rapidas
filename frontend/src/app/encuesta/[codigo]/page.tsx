"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Flame, HeartHandshake, Star } from "lucide-react";
import { AreaTexto, Boton, cx, Esqueleto } from "@/components/ui";
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
    <div className="mx-auto max-w-md px-4 pt-10 pb-12 text-center sm:pt-16">
      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento">
        <Flame className="size-5" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="brand-gradient-text">Comidas Rápidas</span>
      </h1>
      {!estado ? (
        error ? (
          <p className="mt-10 text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="mt-8 grid gap-3" aria-label="Cargando…">
            <Esqueleto className="mx-auto h-6 w-48" />
            <Esqueleto className="h-56 rounded-3xl" />
          </div>
        )
      ) : enviada || estado.yaRespondida ? (
        <div className="mt-8 animate-emerger space-y-2 rounded-3xl border border-border bg-surface p-8 shadow-elevada">
          <HeartHandshake className="mx-auto size-10 text-accent" aria-hidden />
          <p className="text-lg font-semibold">¡Gracias por tu opinión!</p>
          <p className="text-sm text-muted-foreground">Nos ayuda a mejorar cada día.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-8 animate-aparecer space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-elevada sm:p-8">
          <div>
            <p className="text-lg font-semibold">¿Cómo te atendimos?</p>
            <p className="text-sm text-muted-foreground">{estado.contexto}</p>
          </div>
          <div className="flex justify-center gap-1" role="radiogroup" aria-label="Calificación">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === calificacion}
                onClick={() => setCalificacion(n)}
                aria-label={`${n} estrellas`}
                className="rounded-xl p-1.5 transition-transform duration-200 ease-resorte hover:scale-110 active:scale-95"
              >
                <Star className={cx("size-9 transition-colors duration-200", n <= calificacion ? "fill-accent-2 text-accent-2" : "text-border-strong")} />
              </button>
            ))}
          </div>
          <p className="h-5 text-sm font-semibold">{ETIQUETAS[calificacion]}</p>
          <AreaTexto
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={calificacion > 0 && calificacion <= 3 ? "¿Qué podemos mejorar?" : "Cuéntanos algo más (opcional)"}
            aria-label="Comentario"
          />
          {error ? <p className="text-xs font-medium text-peligro">{error}</p> : null}
          <Boton type="submit" bloque tamano="lg" disabled={calificacion === 0} cargando={enviando}>
            {enviando ? "Enviando…" : "Enviar"}
          </Boton>
        </form>
      )}
    </div>
  );
}
