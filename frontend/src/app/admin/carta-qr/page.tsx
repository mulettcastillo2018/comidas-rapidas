"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export default function AdminCartaQrPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const cartaUrl = `${window.location.origin}/carta`;
    setUrl(cartaUrl);
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, cartaUrl, { width: 220, margin: 1 });
    }
  }, []);

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        Este código QR lleva a la carta pública (solo lectura, sin necesidad de iniciar sesión). Imprímelo y déjalo en
        cada mesa para que el cliente pueda revisar los productos desde su celular.
      </p>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-6">
        <canvas ref={canvasRef} />
        <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  );
}
