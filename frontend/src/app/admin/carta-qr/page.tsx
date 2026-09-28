"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa } from "@/lib/types";

export default function AdminCartaQrPage() {
  const token = useAuthStore((state) => state.token);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [seleccion, setSeleccion] = useState<string>("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Mesa[]>("/mesas", { token }).then(setMesas);
  }, [token]);

  useEffect(() => {
    const cartaUrl =
      seleccion === "mostrador"
        ? `${window.location.origin}/carta?recoger=1`
        : seleccion
          ? `${window.location.origin}/carta?mesa=${seleccion}`
          : `${window.location.origin}/carta`;
    setUrl(cartaUrl);
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, cartaUrl, { width: 220, margin: 1 });
    }
  }, [seleccion]);

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        Genera un código QR por mesa: además de ver la carta, el cliente puede dejar armado su pedido para que el
        mesero lo confirme apenas llegue. Imprime uno distinto para cada mesa y déjalo puesto en ella. El QR de
        mostrador es para clientes sin mesa que quieren pedir para recoger — se confirma y se cobra en caja.
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Mesa</label>
        <select
          value={seleccion}
          onChange={(e) => setSeleccion(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        >
          <option value="">Carta general (sin mesa, solo lectura)</option>
          <option value="mostrador">🧾 Mostrador (para recoger, sin mesa)</option>
          {mesas.map((mesa) => (
            <option key={mesa.id} value={mesa.id}>
              Mesa {mesa.numero}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-6">
        <canvas ref={canvasRef} />
        <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  );
}
