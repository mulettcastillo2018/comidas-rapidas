import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AuthUser } from "@/lib/types";

const REMEMBER_KEY = "comidas-remember-me";

function getActiveStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const remember = window.localStorage.getItem(REMEMBER_KEY) !== "false";
  return remember ? window.localStorage : window.sessionStorage;
}

// Guarda la sesión en localStorage (persiste entre reinicios del navegador) o
// sessionStorage (se borra al cerrar la pestaña) según la casilla "Recordarme".
const dynamicStorage: StateStorage = {
  getItem: (name) => getActiveStorage()?.getItem(name) ?? null,
  setItem: (name, value) => getActiveStorage()?.setItem(name, value),
  removeItem: (name) => getActiveStorage()?.removeItem(name),
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
        if (typeof window !== "undefined") {
          window.localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
        }
        set({ token, user });
      },
      logout: () => set({ token: null, user: null }),
    }),
    { name: "comidas-auth", storage: createJSONStorage(() => dynamicStorage) }
  )
);
