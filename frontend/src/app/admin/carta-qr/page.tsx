"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useImpresion, ZonaImpresion } from "@/lib/impresion";
import { ordenarMesas } from "@/lib/mesas";
import { esDireccionLocal, urlPublica } from "@/lib/urlPublica";
import { useAuthStore } from "@/store/auth.store";
import type { Mesa } from "@/lib/types";

// Los QR impresos deben apuntar a la dirección pública definitiva: si
// apuntan a localhost o a la IP del wifi, dejan de funcionar al publicar el
// sitio y habría que reimprimirlos todos.
function urlCarta(base: string, seleccion: string): string {
  if (seleccion === "mostrador") return `${base}/carta?recoger=1`;
  if (seleccion) return `${base}/carta?mesa=${seleccion}`;
  return `${base}/carta`;
}

interface QrImprimible {
  titulo: string;
  subtitulo: string;
  imagen: string;
}

export default function AdminCartaQrPage() {
  const token = useAuthStore((state) => state.token);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [seleccion, setSeleccion] = useState<string>("");
  const [base, setBase] = useState("");
  const [imprimiendo, setImprimiendo] = useImpresion<QrImprimible[]>();

  useEffect(() => {
    setBase(urlPublica());
    if (!token) return;
    apiFetch<Mesa[]>("/mesas", { token }).then((data) => setMesas(ordenarMesas(data)));
  }, [token]);

  const url = base ? urlCarta(base, seleccion) : "";

  useEffect(() => {
    if (url && canvasRef.current) QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1 });
  }, [url]);

  // Una hoja con el QR de cada mesa (y el de mostrador) para recortar.
  async function imprimirTodos() {
    const opciones = [
      { titulo: "Pedidos para recoger", subtitulo: "Escanea, pide y paga en caja", seleccion: "mostrador" },
      ...mesas.map((m) => ({ titulo: `Mesa ${m.numero}`, subtitulo: "Escanea para ver la carta y dejar tu pedido", seleccion: m.id })),
    ];
    setImprimiendo(
      await Promise.all(
        opciones.map(async (o) => ({
          titulo: o.titulo,
          subtitulo: o.subtitulo,
          imagen: await QRCode.toDataURL(urlCarta(base, o.seleccion), { width: 400, margin: 1 }),
        }))
      )
    );
  }

  return (
    <div className="max-w-md space-y-4">
      {imprimiendo ? (
        <ZonaImpresion>
          <div className="grid grid-cols-2 gap-6 p-4">
            {imprimiendo.map((qr) => (
              <div key={qr.titulo} className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border-2 border-dashed border-foreground p-4 text-center">
                <p className="text-xl font-extrabold">{qr.titulo}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.imagen} alt={qr.titulo} className="h-48 w-48" />
                <p className="text-xs">{qr.subtitulo}</p>
              </div>
            ))}
          </div>
        </ZonaImpresion>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Genera un código QR por mesa: además de ver la carta, el cliente puede dejar armado su pedido para que el
        mesero lo confirme apenas llegue. Imprime uno distinto para cada mesa y déjalo puesto en ella. El QR de
        mostrador es para clientes sin mesa que quieren pedir para recoger — se confirma y se cobra en caja.
      </p>

      {base && esDireccionLocal(base) ? (
        <div className="flex gap-2 rounded-xl border border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={16} className="shrink-0" />
          <p>
            Estos QR apuntan a <strong>{base}</strong>, una dirección local: solo funcionan dentro de este wifi y dejarán
            de servir cuando el sitio se publique. Sirven para pruebas, pero no los imprimas como definitivos hasta
            configurar la dirección pública (NEXT_PUBLIC_URL_PUBLICA).
          </p>
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Mesa</label>
        <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
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
      {mesas.length > 0 ? (
        <button onClick={imprimirTodos} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold">
          <Printer size={16} /> Imprimir los QR de todas las mesas
        </button>
      ) : null}
    </div>
  );
}
