"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoHora } from "@/lib/tiempoEstimado";
import { useAuthStore } from "@/store/auth.store";
import { cx, PuntoVivo } from "@/components/ui";
import { useToastStore } from "@/store/toast.store";

interface TurnoAbierto {
  id: string;
  entrada: string;
}

// Marcar entrada y salida del turno: con esas horas se reparten las propinas.
export function BotonTurno() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [abierto, setAbierto] = useState<TurnoAbierto | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);

  const aplica = Boolean(token && user && user.role !== "PANTALLA");

  useEffect(() => {
    if (!aplica) return;
    apiFetch<{ abierto: TurnoAbierto | null }>("/turnos/mio", { token })
      .then((r) => setAbierto(r.abierto))
      .catch(() => setAbierto(undefined));
  }, [aplica, token]);

  if (!aplica || abierto === undefined) return null;

  async function marcar() {
    if (abierto && !confirm("¿Terminar tu turno?")) return;
    setOcupado(true);
    try {
      if (abierto) {
        await apiFetch("/turnos/salida", { method: "POST", token });
        setAbierto(null);
        showToast("Turno terminado. ¡Buen descanso!");
      } else {
        const turno = await apiFetch<TurnoAbierto>("/turnos/entrada", { method: "POST", token });
        setAbierto(turno);
        showToast("Turno iniciado");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "No se pudo registrar el turno");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      onClick={marcar}
      disabled={ocupado}
      title={abierto ? `En turno desde las ${formatoHora(abierto.entrada)}` : "Marcar la entrada a tu turno"}
      aria-label={abierto ? `En turno desde las ${formatoHora(abierto.entrada)}. Terminar turno` : "Iniciar turno"}
      className={cx(
        "flex h-9 w-9 items-center justify-center gap-2 rounded-full text-xs font-semibold ring-1 ring-inset transition-all duration-200 ease-resorte active:scale-95 disabled:opacity-50 sm:w-auto sm:px-3",
        abierto
          ? "bg-exito/10 text-exito ring-exito/20 hover:bg-exito/15"
          : "bg-surface text-muted-foreground ring-border hover:text-foreground hover:ring-border-strong",
      )}
    >
      {abierto ? <PuntoVivo tono="exito" /> : <Clock className="size-3.5" aria-hidden />}
      <span className="hidden sm:inline">{abierto ? `En turno · ${formatoHora(abierto.entrada)}` : "Iniciar turno"}</span>
    </button>
  );
}
