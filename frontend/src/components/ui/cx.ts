import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge resuelve choques de clases (la última gana: "w-full" + "w-24" → "w-24").
// Se le enseñan los tokens propios de globals.css para que los reconozca como tales.
const unir = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "background",
        "surface",
        "surface-2",
        "foreground",
        "muted",
        "muted-foreground",
        "border",
        "border-strong",
        "accent",
        "accent-foreground",
        "accent-2",
        "exito",
        "aviso",
        "peligro",
        "info",
        "ring",
      ],
      shadow: ["suave", "elevada", "flotante", "acento"],
      ease: ["resorte", "salida"],
      animate: ["aparecer", "emerger", "brillo"],
    },
  },
});

/** Une clases utilitarias, ignora las condicionales que no aplican y resuelve choques. */
export function cx(...clases: (string | false | null | undefined)[]): string {
  return unir(clases.filter(Boolean).join(" "));
}
