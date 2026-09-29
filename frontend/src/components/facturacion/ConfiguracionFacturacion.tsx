"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { digitoVerificacion, URL_PRODUCCION, URL_SANDBOX, type ConfiguracionFiscal } from "@/lib/facturacion";

type Campos = Omit<ConfiguracionFiscal, "activadaEn" | "esSandbox" | "token" | "faltantes" | "avisos" | "sede">;

const NUMERICOS = ["feDesde", "feHasta", "feSiguiente", "impuestoPct"] as const;

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      {ayuda ? <span className="block text-xs text-muted-foreground">{ayuda}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const entrada = "w-full rounded-lg border border-border px-2 py-1.5 text-sm";

export function ConfiguracionFacturacion({
  token,
  config,
  onCambio,
  onAviso,
  soloLectura,
}: {
  token: string;
  config: ConfiguracionFiscal;
  onCambio: (c: ConfiguracionFiscal) => void;
  onAviso: (mensaje: string) => void;
  // El administrador de una sede la ve pero no la cambia (es del negocio).
  soloLectura: boolean;
}) {
  const inicial = Object.fromEntries(
    Object.entries(config).filter(([k]) => !["activadaEn", "esSandbox", "token", "faltantes", "avisos", "id", "sede"].includes(k))
  ) as unknown as Campos;
  const [campos, setCampos] = useState<Campos>(inicial);
  const [nuevoToken, setNuevoToken] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => setCampos((prev) => ({ ...prev, [k]: v }));
  const texto = (k: keyof Campos) => ({
    value: (campos[k] as string | number | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      set(k, ((NUMERICOS as readonly string[]).includes(k) ? (v === "" ? null : Number(v.replace(/\D/g, ""))) : v === "" ? null : v) as never);
    },
  });
  const ambientePersonalizado = campos.alanubeUrl !== URL_SANDBOX && campos.alanubeUrl !== URL_PRODUCCION;

  async function accion(ruta: string, exito: string) {
    setError(null);
    try {
      const r = await apiFetch<ConfiguracionFiscal | { ok: boolean; mensaje: string }>(ruta, { method: "POST", token });
      if ("faltantes" in r) {
        onCambio(r);
        setCampos((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(r).filter(([k]) => k in prev)) }));
      }
      onAviso(exito);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    }
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = {
        ...campos,
        dv: campos.nit ? digitoVerificacion(campos.nit) : null,
        notaPrefijo: campos.notaPrefijo || "NC",
        ajustePrefijo: campos.ajustePrefijo || "NA",
        ...(nuevoToken.trim() ? { alanubeToken: nuevoToken.trim() } : {}),
      };
      const r = await apiFetch<ConfiguracionFiscal>("/facturacion/configuracion", { method: "PUT", token, body: JSON.stringify(cuerpo) });
      onCambio(r);
      setNuevoToken("");
      onAviso("Configuración de facturación guardada");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-5">
      {soloLectura ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          La configuración de facturación es de todo el negocio: la cambia el administrador general. La numeración POS y la caja de tu sede están en{" "}
          <Link href="/admin/sedes" className="font-semibold text-accent">
            Sedes
          </Link>
          .
        </p>
      ) : null}
      <fieldset disabled={soloLectura} className="space-y-5">
      <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-semibold">
        <input type="checkbox" checked={campos.activa} onChange={(e) => set("activa", e.target.checked)} />
        Facturar electrónicamente cada cuenta cobrada
        <span className="font-normal text-muted-foreground">(lo cobrado antes de activarla no se factura)</span>
      </label>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">Conexión con Alanube</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Ambiente">
            <select
              value={ambientePersonalizado ? "OTRO" : campos.alanubeUrl}
              onChange={(e) => e.target.value !== "OTRO" && set("alanubeUrl", e.target.value)}
              className={entrada}
            >
              <option value={URL_SANDBOX}>Pruebas (sandbox, habilitación DIAN)</option>
              <option value={URL_PRODUCCION}>Producción (facturas reales)</option>
              {ambientePersonalizado ? <option value="OTRO">Local de pruebas ({campos.alanubeUrl})</option> : null}
            </select>
          </Campo>
          <Campo
            label="Token de Alanube"
            ayuda={
              config.token.desdeEntorno
                ? "Se toma de la variable ALANUBE_TOKEN del servidor."
                : config.token.configurado
                  ? `Guardado (termina en ${config.token.final}). Escribe uno nuevo solo para cambiarlo.`
                  : "Lo entrega Alanube al crear tu cuenta."
            }
          >
            <input type="password" autoComplete="off" value={nuevoToken} onChange={(e) => setNuevoToken(e.target.value)} placeholder="Bearer token" className={entrada} />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">Empresa</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="NIT" ayuda={campos.nit ? `Dígito de verificación: ${digitoVerificacion(campos.nit)}` : "Sin dígito de verificación"}>
            <input {...texto("nit")} inputMode="numeric" className={entrada} />
          </Campo>
          <Campo label="Razón social">
            <input {...texto("razonSocial")} className={entrada} />
          </Campo>
          <Campo label="Id de la compañía en Alanube">
            <input {...texto("alanubeCompanyId")} className={entrada} />
          </Campo>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => accion("/facturacion/configuracion/compania", "Compañía creada en Alanube")} className="font-semibold text-accent">
            Crear la compañía en Alanube con este NIT
          </button>
          <button type="button" onClick={() => accion("/facturacion/configuracion/probar", "Conexión con Alanube correcta")} className="font-semibold text-accent">
            Probar la conexión
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Guarda antes de usar estos botones. En el sandbox, Alanube usa el NIT de pruebas 900559088.</p>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">Impuesto y documento</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Impuesto incluido en los precios de la carta">
            <select
              value={campos.impuesto}
              onChange={(e) => {
                const valor = e.target.value as Campos["impuesto"];
                setCampos((prev) => ({ ...prev, impuesto: valor, impuestoPct: valor === "INC" ? 8 : valor === "IVA" ? 19 : 0 }));
              }}
              className={entrada}
            >
              <option value="INC">Impuesto al consumo (INC) 8% — restaurantes</option>
              <option value="IVA">IVA 19%</option>
              <option value="NINGUNO">No responsable (sin impuesto)</option>
            </select>
          </Campo>
          <Campo label="A quien no pide factura a su nombre" ayuda="Quien la pide con sus datos siempre recibe factura electrónica.">
            <select value={campos.documentoPorDefecto} onChange={(e) => set("documentoPorDefecto", e.target.value as Campos["documentoPorDefecto"])} className={entrada}>
              <option value="FACTURA">Factura electrónica a consumidor final</option>
              <option value="POS">Documento equivalente electrónico POS</option>
            </select>
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">Numeración de facturación electrónica (resolución DIAN)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Resolución">
            <input {...texto("feResolucion")} className={entrada} />
          </Campo>
          <Campo label="Prefijo">
            <input {...texto("fePrefijo")} className={entrada} />
          </Campo>
          <Campo label="Desde">
            <input {...texto("feDesde")} inputMode="numeric" className={entrada} />
          </Campo>
          <Campo label="Hasta">
            <input {...texto("feHasta")} inputMode="numeric" className={entrada} />
          </Campo>
          <Campo label="Vigente desde">
            <input type="date" {...texto("feFechaInicio")} className={entrada} />
          </Campo>
          <Campo label="Vigente hasta">
            <input type="date" {...texto("feFechaFin")} className={entrada} />
          </Campo>
          <Campo label="Clave técnica">
            <input {...texto("feClaveTecnica")} className={entrada} />
          </Campo>
          <Campo label="Siguiente número" ayuda="Vacío: continúa donde iba">
            <input {...texto("feSiguiente")} inputMode="numeric" className={entrada} />
          </Campo>
        </div>
        {config.esSandbox || ambientePersonalizado ? (
          <button type="button" onClick={() => accion("/facturacion/configuracion/numeracion-pruebas", "Numeración de pruebas de la DIAN cargada")} className="text-xs font-semibold text-accent">
            Usar la numeración de pruebas de la DIAN (habilitación)
          </button>
        ) : null}
      </fieldset>

      <div className="rounded-xl border border-border p-3 text-sm">
        <p className="font-bold">Documento equivalente POS (si lo usas)</p>
        <p className="mt-1 text-muted-foreground">
          Cada sede tiene su caja y su propia resolución de numeración POS: se configuran en{" "}
          <Link href="/admin/sedes" className="font-semibold text-accent">
            Sedes
          </Link>
          .{config.sede && config.faltantes.POS.length > 0 ? ` A ${config.sede.nombre} le falta: ${config.faltantes.POS.join(", ")}.` : ""}
        </p>
      </div>

      <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-bold">Notas para anular</legend>
        <Campo label="Prefijo de notas crédito">
          <input {...texto("notaPrefijo")} className={entrada} />
        </Campo>
        <Campo label="Prefijo de notas de ajuste (POS)">
          <input {...texto("ajustePrefijo")} className={entrada} />
        </Campo>
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {soloLectura ? null : (
        <button disabled={guardando} className="btn-primary rounded-full px-6 py-2 text-sm disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      )}
      </fieldset>
    </form>
  );
}
