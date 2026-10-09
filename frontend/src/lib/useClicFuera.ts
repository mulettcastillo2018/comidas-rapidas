import { useEffect, useRef } from "react";

/**
 * Cierra un menú o panel desplegable al hacer clic fuera de él o al presionar
 * Escape. Devuelve la referencia que se pone en el contenedor del menú.
 */
export function useClicFuera<T extends HTMLElement>(abierto: boolean, cerrar: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClic(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto, cerrar]);

  return ref;
}
