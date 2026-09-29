import { useEffect, useState } from "react";
import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export interface SedeBasica {
  id: string;
  nombre: string;
  direccion: string | null;
  activa: boolean;
  esPrincipal: boolean;
}

// Lo que ve el admin: además, la numeración POS y la caja de la sede.
export interface Sede extends SedeBasica {
  posResolucion?: string | null;
  posPrefijo?: string | null;
  posDesde?: number | null;
  posHasta?: number | null;
  posFechaInicio?: string | null;
  posFechaFin?: string | null;
  posSiguiente?: number | null;
  cajaPlaca?: string | null;
  cajaUbicacion?: string | null;
  personal?: number;
  mesas?: number;
  faltantesPos?: string[];
}

export interface SedesRespuesta {
  // La sede en la que se está trabajando.
  actual: string;
  // Solo el administrador general elige la sede.
  puedeCambiar: boolean;
  sedes: Sede[];
}

export { elegirSede, sedeElegida } from "@/lib/sedeElegida";

let cache: { token: string; promesa: Promise<SedesRespuesta> } | null = null;

export function cargarSedes(token: string): Promise<SedesRespuesta> {
  if (!cache || cache.token !== token) {
    const promesa = apiFetch<SedesRespuesta>("/sedes", { token });
    cache = { token, promesa };
    promesa.catch(() => {
      if (cache?.promesa === promesa) cache = null;
    });
  }
  return cache.promesa;
}

// Tras crear o editar una sede.
export function olvidarSedes() {
  cache = null;
}

export function useSedes(): SedesRespuesta | null {
  const token = useAuthStore((state) => state.token);
  const [datos, setDatos] = useState<SedesRespuesta | null>(null);
  useEffect(() => {
    if (!token) return;
    let vigente = true;
    cargarSedes(token)
      .then((d) => vigente && setDatos(d))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token]);
  return token ? datos : null;
}

export const activas = (r: SedesRespuesta | null) => r?.sedes.filter((s) => s.activa) ?? [];
export const nombreActual = (r: SedesRespuesta | null) => r?.sedes.find((s) => s.id === r.actual)?.nombre ?? null;

// Reportes: de la sede en la que se está o de todas (solo el administrador
// general, y solo si hay más de una). Se comparte entre las pantallas de
// reportes de esta pestaña.
export const useAlcanceSedes = create<{ todas: boolean; setTodas: (todas: boolean) => void }>((set) => ({
  todas: false,
  setTodas: (todas) => set({ todas }),
}));

export function useVerTodas(): boolean {
  const sedes = useSedes();
  const todas = useAlcanceSedes((s) => s.todas);
  return todas && Boolean(sedes?.puedeCambiar) && activas(sedes).length > 1;
}

export function conAlcance(ruta: string, todas: boolean): string {
  return todas ? `${ruta}${ruta.includes("?") ? "&" : "?"}sede=todas` : ruta;
}
