import { useAuthStore } from "@/store/auth.store";

// Cuando el servidor rechaza la sesión (cuenta desactivada, rol cambiado o
// token vencido) se cierra en este navegador y se vuelve al login mostrando
// el motivo, en vez de dejar al usuario en una página que ya no puede operar.
export function cerrarSesionForzada(motivo: string) {
  if (typeof window === "undefined") return;
  useAuthStore.getState().logout();
  window.location.replace(`/login?aviso=${encodeURIComponent(motivo)}`);
}
