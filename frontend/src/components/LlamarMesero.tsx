"use client";

import { useState } from "react";
import { CircleCheck, Hand, Receipt, TriangleAlert } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Boton, cx } from "@/components/ui";

type Tipo = "MESERO" | "CUENTA";

// Desde el QR de la mesa: el cliente llama al mesero o pide la cuenta sin
// tener que levantar la mano. Al mesero le llega un aviso con sonido.
export function LlamarMesero({ mesaId }: { mesaId: string }) {
  const [enviando, setEnviando] = useState<Tipo | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);

  async function llamar(tipo: Tipo) {
    setEnviando(tipo);
    setAviso(null);
    try {
      await apiFetch("/llamados", { method: "POST", body: JSON.stringify({ mesaId, tipo }) });
      setAviso({ texto: tipo === "CUENTA" ? "Listo, tu mesero ya sabe que quieres la cuenta." : "Listo, tu mesero ya viene." });
    } catch (err) {
      setAviso({ texto: err instanceof ApiError ? err.message : "No se pudo avisar. Intenta de nuevo.", error: true });
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Boton variante="secundario" className="text-accent" onClick={() => llamar("MESERO")} disabled={enviando !== null} cargando={enviando === "MESERO"}>
          {enviando === "MESERO" ? null : <Hand />} Llamar al mesero
        </Boton>
        <Boton variante="secundario" className="text-accent" onClick={() => llamar("CUENTA")} disabled={enviando !== null} cargando={enviando === "CUENTA"}>
          {enviando === "CUENTA" ? null : <Receipt />} Pedir la cuenta
        </Boton>
      </div>
      {aviso ? (
        <p
          role="status"
          className={cx(
            "flex animate-emerger items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-xs font-medium",
            aviso.error ? "bg-peligro/10 text-peligro" : "bg-exito/10 text-exito",
          )}
        >
          {aviso.error ? <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> : <CircleCheck className="size-3.5 shrink-0" aria-hidden />}
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
