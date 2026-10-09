"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Cocina y pantalla del salón usan el tema oscuro profundo (tableros en TV o
// tablet); el resto, el claro. El script del <head> lo aplica antes de pintar
// la primera vez y este componente lo mantiene al navegar dentro del sitio.
const RUTAS_OSCURAS = /^\/(cocina|pantalla)(\/|$)/;

export const SCRIPT_TEMA = `(function(){try{if(${RUTAS_OSCURAS}.test(location.pathname))document.documentElement.dataset.tema="oscuro"}catch(e){}})()`;

export function TemaPorRuta() {
  const pathname = usePathname();
  useEffect(() => {
    if (RUTAS_OSCURAS.test(pathname)) document.documentElement.dataset.tema = "oscuro";
    else delete document.documentElement.dataset.tema;
  }, [pathname]);
  return null;
}
