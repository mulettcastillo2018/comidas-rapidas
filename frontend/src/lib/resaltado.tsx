"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const DURACION_MS = 8000;

function Lector({ claves, onLeer }: { claves: string[]; onLeer: (valores: Record<string, string>) => void }) {
  const params = useSearchParams();
  const firma = claves.map((c) => `${c}=${params.get(c) ?? ""}`).join("&");
  useEffect(() => {
    const valores: Record<string, string> = {};
    for (const clave of claves) {
      const valor = params.get(clave);
      if (valor) valores[clave] = valor;
    }
    if (Object.keys(valores).length > 0) onLeer(valores);
    // Solo cuando cambian los valores de la URL (p. ej. otro clic en la campana).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);
  return null;
}

// Lo que una notificación pidió resaltar al abrir esta pantalla (vía la URL,
// p. ej. /cocina?pedido=…&item=…). Se desvanece solo a los pocos segundos y
// lleva la vista hasta el primer elemento marcado con data-resaltado.
export function useResaltado(claves: string[]) {
  const [resaltado, setResaltado] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Object.keys(resaltado).length === 0) return;
    // Si la pantalla recién abre, los datos pueden tardar un momento en
    // llegar: se busca el elemento unos segundos hasta que aparezca.
    let intentos = 0;
    const buscar = setInterval(() => {
      const elemento = document.querySelector('[data-resaltado="true"]');
      if (elemento) elemento.scrollIntoView({ behavior: "smooth", block: "center" });
      if (elemento || ++intentos >= 12) clearInterval(buscar);
    }, 250);
    const apagar = setTimeout(() => setResaltado({}), DURACION_MS);
    return () => {
      clearInterval(buscar);
      clearTimeout(apagar);
    };
  }, [resaltado]);

  // useSearchParams necesita un Suspense alrededor en Next; así no hay que
  // envolver la página completa.
  const lector = (
    <Suspense fallback={null}>
      <Lector claves={claves} onLeer={setResaltado} />
    </Suspense>
  );
  return [resaltado, lector] as const;
}

export const CLASE_RESALTADO = "ring-4 ring-amber-400 ring-offset-2 transition-shadow";
