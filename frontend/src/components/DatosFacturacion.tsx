"use client";

import { Entrada, Selector } from "@/components/ui";
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
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Selector value={valor.tipoIdentificacion} onChange={(e) => cambiar({ tipoIdentificacion: e.target.value })} aria-label="Tipo de documento">
        {TIPOS_IDENTIFICACION.map((t) => (
          <option key={t.codigo} value={t.codigo}>
            {t.nombre}
          </option>
        ))}
      </Selector>
      <div className="flex items-center gap-2">
        <Entrada
          value={valor.numero}
          onChange={(e) => cambiar({ numero: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
          placeholder={esNit ? "NIT sin dígito de verificación" : "Número de documento"}
          inputMode={esNit ? "numeric" : "text"}
          aria-label="Número de documento"
          className="min-w-0 flex-1"
        />
        {esNit && valor.numero ? <span className="shrink-0 text-sm text-muted-foreground tabular-nums">DV {valor.dv}</span> : null}
      </div>
      <Entrada
        value={valor.nombre}
        onChange={(e) => cambiar({ nombre: e.target.value })}
        placeholder={esNit ? "Razón social" : "Nombre completo"}
        aria-label={esNit ? "Razón social" : "Nombre completo"}
      />
      <Entrada
        value={valor.email ?? ""}
        onChange={(e) => cambiar({ email: e.target.value.trim() })}
        placeholder="Correo para enviarle la factura (opcional)"
        inputMode="email"
        aria-label="Correo para enviarle la factura"
      />
    </div>
  );
}
