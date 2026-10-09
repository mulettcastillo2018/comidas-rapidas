"use client";

import { cx } from "@/components/ui";

const miles = new Intl.NumberFormat("es-CO");

// Campo de dinero: solo toma dígitos, así "150.000", "150000" y "$150.000"
// valen lo mismo (un campo numérico normal leería "150.000" como 150).
export function CampoPesos({
  label,
  valor,
  onChange,
  ayuda,
  compacto,
}: {
  label?: string;
  valor: number | null;
  onChange: (v: number | null) => void;
  ayuda?: string;
  compacto?: boolean;
}) {
  const campo = (
    <div
      className={cx(
        "flex items-center border border-border bg-surface shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-200 ease-salida",
        "hover:border-border-strong focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15",
        compacto ? "h-8 rounded-lg px-2.5 text-xs" : "h-10 rounded-xl px-3.5 text-sm",
        label && "mt-1.5",
      )}
    >
      <span className="text-muted-foreground">$</span>
      <input
        inputMode="numeric"
        value={valor === null ? "" : miles.format(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "");
          onChange(digitos === "" ? null : Number(digitos));
        }}
        placeholder="0"
        aria-label={label}
        className="h-full w-full min-w-0 bg-transparent px-1 tabular-nums outline-none"
      />
    </div>
  );
  if (!label) return campo;
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {ayuda ? <span className="block text-xs text-muted-foreground">{ayuda}</span> : null}
      {campo}
    </label>
  );
}
