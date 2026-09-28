"use client";

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
    <div className={`flex items-center rounded-lg border border-border px-2 ${label ? "mt-1" : ""}`}>
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
        className={`w-full min-w-0 bg-transparent px-1 outline-none ${compacto ? "py-1" : "py-2"}`}
      />
    </div>
  );
  if (!label) return campo;
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      {ayuda ? <span className="block text-xs text-muted-foreground">{ayuda}</span> : null}
      {campo}
    </label>
  );
}
