"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

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
      <div className="flex gap-2">
        <button
          onClick={() => llamar("MESERO")}
          disabled={enviando !== null}
          className="flex-1 rounded-full border border-accent px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50"
        >
          🙋 Llamar al mesero
        </button>
        <button
          onClick={() => llamar("CUENTA")}
          disabled={enviando !== null}
          className="flex-1 rounded-full border border-accent px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50"
        >
          🧾 Pedir la cuenta
        </button>
      </div>
      {aviso ? <p className={`text-center text-xs ${aviso.error ? "text-red-600" : "text-green-700"}`}>{aviso.texto}</p> : null}
    </div>
  );
}
