"use client";

import { digitoVerificacion, TIPOS_IDENTIFICACION, type Adquiriente } from "@/lib/facturacion";

export const ADQUIRIENTE_VACIO: Adquiriente = { tipoIdentificacion: "13", numero: "", nombre: "", email: "" };

// Datos de quien pide la factura electrónica a su nombre. Para un NIT, el
// dígito de verificación se calcula solo (evita el error más común).
export function DatosFacturacion({ valor, onCambio }: { valor: Adquiriente; onCambio: (a: Adquiriente) => void }) {
  const esNit = valor.tipoIdentificacion === "31";
  const cambiar = (cambio: Partial<Adquiriente>) => {
    const nuevo = { ...valor, ...cambio };
    nuevo.dv = nuevo.tipoIdentificacion === "31" && nuevo.numero ? digitoVerificacion(nuevo.numero) : null;
    onCambio(nuevo);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select
        value={valor.tipoIdentificacion}
        onChange={(e) => cambiar({ tipoIdentificacion: e.target.value })}
        className="rounded-lg border border-border px-2 py-1.5 text-sm"
      >
        {TIPOS_IDENTIFICACION.map((t) => (
          <option key={t.codigo} value={t.codigo}>
            {t.nombre}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <input
          value={valor.numero}
          onChange={(e) => cambiar({ numero: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
          placeholder={esNit ? "NIT sin dígito de verificación" : "Número de documento"}
          inputMode={esNit ? "numeric" : "text"}
          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
        {esNit && valor.numero ? <span className="shrink-0 text-sm text-muted-foreground">DV {valor.dv}</span> : null}
      </div>
      <input
        value={valor.nombre}
        onChange={(e) => cambiar({ nombre: e.target.value })}
        placeholder={esNit ? "Razón social" : "Nombre completo"}
        className="rounded-lg border border-border px-2 py-1.5 text-sm"
      />
      <input
        value={valor.email ?? ""}
        onChange={(e) => cambiar({ email: e.target.value.trim() })}
        placeholder="Correo para enviarle la factura (opcional)"
        inputMode="email"
        className="rounded-lg border border-border px-2 py-1.5 text-sm"
      />
    </div>
  );
}
