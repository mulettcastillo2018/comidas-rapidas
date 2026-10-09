"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { ConfiguracionFacturacion } from "@/components/facturacion/ConfiguracionFacturacion";
import { DocumentosFiscales } from "@/components/facturacion/DocumentosFiscales";
import type { ConfiguracionFiscal } from "@/lib/facturacion";
import { AlcanceSedes } from "@/components/SelectorSede";

export default function AdminFacturacionPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [config, setConfig] = useState<ConfiguracionFiscal | null>(null);
  const [verConfig, setVerConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Para rearmar el formulario cuando llega la configuración guardada.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!token) return;
    apiFetch<ConfiguracionFiscal>("/facturacion/configuracion", { token })
      .then((c) => {
        setConfig(c);
        setVerConfig(!c.activa);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la configuración."));
  }, [token]);

  if (!token) return null;
  if (!config) return <p className="text-sm text-muted-foreground">{error ?? "Cargando…"}</p>;

  const faltantes = config.documentoPorDefecto === "POS" ? config.faltantes.POS : config.faltantes.FACTURA;

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-4 text-sm bg-surface shadow-suave ${config.activa && faltantes.length === 0 ? "border-exito" : "border-aviso"}`}>
        <p className="font-semibold">
          {config.activa ? "Facturación electrónica activa" : "Facturación electrónica apagada"} ·{" "}
          {config.esSandbox ? "ambiente de pruebas (sandbox de Alanube, habilitación DIAN)" : config.alanubeUrl.includes("sandbox") ? "pruebas" : "producción"}
        </p>
        {faltantes.length > 0 ? <p className="mt-1 text-aviso">Falta configurar: {faltantes.join(", ")}.</p> : null}
        {config.avisos.map((a) => (
          <p key={a} className="mt-1 text-aviso">
            {a}
          </p>
        ))}
        <p className="mt-1 text-xs text-muted-foreground">
          Cada cuenta cobrada se envía sola a la DIAN por medio de Alanube. Si no hay internet, queda pendiente y se envía cuando vuelva: el cobro nunca
          se frena por esto.
        </p>
        <button onClick={() => setVerConfig((v) => !v)} className="mt-2 text-xs font-semibold text-accent">
          {verConfig ? "Ocultar configuración" : "Ver configuración"}
        </button>
      </div>

      {verConfig ? (
        <ConfiguracionFacturacion
          key={version}
          token={token}
          config={config}
          onCambio={(c) => {
            setConfig(c);
            setVersion((v) => v + 1);
          }}
          onAviso={showToast}
          soloLectura={Boolean(user?.sede)}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">Documentos electrónicos</h2>
          <AlcanceSedes />
        </div>
        <DocumentosFiscales token={token} onAviso={showToast} />
      </section>
    </div>
  );
}
