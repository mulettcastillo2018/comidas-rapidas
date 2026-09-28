import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AuthUser } from "@/lib/types";

// La decisión de "recordarme" vive SOLO en memoria de esta ventana (nunca se
// persiste en localStorage) — así cada pestaña/ventana decide su propio
// destino de escritura sin que ninguna otra pueda enterarse ni pisarla. Antes
// esa decisión se guardaba en localStorage, que SÍ se comparte entre todas
// las ventanas de una misma sesión (incluida una de incógnito): bastaba que
// una sola ventana quedara con "recordarme" activo para que las demás
// terminaran leyendo esa sesión compartida, aunque en ellas la casilla
// estuviera desmarcada.
let rememberEnMemoria = true;

const dynamicStorage: StateStorage = {
  // Al cargar la página (antes de iniciar sesión en ESTA ventana) miramos
  // primero su propio sessionStorage; si no hay nada ahí, recién entonces
  // caemos a localStorage por si hay una sesión "recordada" de antes. Esto
  // es intencional: es justamente lo que "recordarme" debe hacer.
  // Al leer se recuerda de dónde vino la sesión, para que las escrituras
  // siguientes (incluido cerrar sesión) vayan al mismo lugar. Sin esto, tras
  // recargar la página una sesión sin "recordarme" se escribía en
  // localStorage al cerrar sesión y el token seguía vivo en sessionStorage:
  // al volver a cargar, el usuario aparecía logueado otra vez.
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    const deEstaVentana = window.sessionStorage.getItem(name);
    if (deEstaVentana !== null) {
      rememberEnMemoria = false;
      return deEstaVentana;
    }
    const recordada = window.localStorage.getItem(name);
    if (recordada !== null) rememberEnMemoria = true;
    return recordada;
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    (rememberEnMemoria ? window.localStorage : window.sessionStorage).setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(name);
    window.localStorage.removeItem(name);
  },
};

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser, remember?: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user, remember = true) => {
        rememberEnMemoria = remember;
        set({ token, user });
      },
      logout: () => {
        set({ token: null, user: null });
        dynamicStorage.removeItem("comidas-auth");
      },
    }),
    { name: "comidas-auth", storage: createJSONStorage(() => dynamicStorage) }
  )
);
