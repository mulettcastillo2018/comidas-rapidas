import { cx } from "./cx";

/**
 * Pestañas en forma de control segmentado. En pantallas angostas se desplaza
 * de lado en lugar de partir el texto de cada opción.
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
}: {
  opciones: readonly { id: T; label: string }[];
  valor: T;
  onCambio: (valor: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label={etiqueta} className="flex w-max gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold ring-1 ring-border ring-inset">
        {opciones.map((opcion) => (
          <button
            key={opcion.id}
            role="tab"
            aria-selected={valor === opcion.id}
            onClick={() => onCambio(opcion.id)}
            className={cx(
              "rounded-full px-4 py-1.5 whitespace-nowrap transition-all duration-200 ease-salida",
              valor === opcion.id ? "bg-surface text-foreground shadow-suave" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcion.label}
          </button>
        ))}
      </div>
    </div>
  );
}
