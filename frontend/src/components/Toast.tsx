"use client";

import { useEffect } from "react";
import { useToastStore } from "@/store/toast.store";

export function Toast() {
  const message = useToastStore((state) => state.message);
  const clear = useToastStore((state) => state.clear);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 3000);
    return () => clearTimeout(timer);
  }, [message, clear]);

  return (
    // La región existe siempre para que los lectores de pantalla anuncien cada aviso.
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 print:hidden">
      {message ? (
        <div
          key={message}
          className="max-w-md animate-emerger rounded-2xl bg-foreground/90 px-4 py-3 text-center text-sm font-medium text-background shadow-flotante backdrop-blur-xl"
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
