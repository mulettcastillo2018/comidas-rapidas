"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Imprime solo un contenido puntual (precuenta, comprobante de caja...) sin
// el resto de la página: el contenido se monta directo en <body> y, mientras
// se imprime, globals.css oculta todo lo demás.
export function useImpresion<T>() {
  const [contenido, setContenido] = useState<T | null>(null);

  useEffect(() => {
    if (contenido === null) return;
    document.body.classList.add("imprimiendo");
    const terminar = () => setContenido(null);
    window.addEventListener("afterprint", terminar);
    window.print();
    return () => {
      window.removeEventListener("afterprint", terminar);
      document.body.classList.remove("imprimiendo");
    };
  }, [contenido]);

  return [contenido, setContenido] as const;
}

export function ZonaImpresion({ children }: { children: ReactNode }) {
  return createPortal(<div className="zona-impresion hidden print:block">{children}</div>, document.body);
}
