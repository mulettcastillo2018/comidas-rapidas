"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { useImpresion, ZonaImpresion } from "@/lib/impresion";
import { CLASE_RESALTADO, useResaltado } from "@/lib/resaltado";
import {
  ESTADO_DOCUMENTO_LABEL,
  problemaAdquiriente,
  TIPO_DOCUMENTO_CORTO,
  type Adquiriente,
  type DocumentoFiscalDetalle,
  type DocumentoFiscalResumen,
  type EstadoDocumentoFiscal,
} from "@/lib/facturacion";
import { ADQUIRIENTE_VACIO, DatosFacturacion } from "@/components/DatosFacturacion";
import { RepresentacionGrafica } from "./RepresentacionGrafica";
import { conAlcance, useVerTodas } from "@/lib/sedes";

const COLOR_ESTADO: Record<EstadoDocumentoFiscal, string> = {
  PENDIENTE: "bg-aviso/10 text-aviso",
  ENVIADO: "bg-info/10 text-info",
  ACEPTADO: "bg-exito/10 text-exito",
  RECHAZADO: "bg-peligro/10 text-peligro",
};

function ANombreDe({ token, doc, onListo }: { token: string; doc: DocumentoFiscalResumen; onListo: (mensaje: string) => void }) {
  const [adquiriente, setAdquiriente] = useState<Adquiriente>(ADQUIRIENTE_VACIO);
  const [error, setError] = useState<string | null>(null);
  const problema = problemaAdquiriente(adquiriente);

  async function emitir() {
    setError(null);
    try {
      const r = await apiFetch<{ numeroCompleto: string }>(`/facturacion/cuentas/${doc.facturaId}/adquiriente`, {
        method: "PUT",
        token,
        body: JSON.stringify({ ...adquiriente, email: adquiriente.email || null }),
      });
      onListo(`Se emite la factura ${r.numeroCompleto} a nombre de ${adquiriente.nombre}${doc.estado === "ACEPTADO" ? " (y se anula el documento anterior)" : ""}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo emitir la factura.");
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-2">
      <DatosFacturacion valor={adquiriente} onCambio={setAdquiriente} />
      {error ? <p className="text-xs text-peligro">{error}</p> : null}
      <button onClick={emitir} disabled={Boolean(problema)} className="btn-primary rounded-full px-4 py-1 text-xs disabled:opacity-50">
        Emitir factura a su nombre
      </button>
    </div>
  );
}

interface ListaDocumentos {
  documentos: DocumentoFiscalResumen[];
  porEstado: Partial<Record<EstadoDocumentoFiscal, number>>;
}

export function DocumentosFiscales({ token, onAviso }: { token: string; onAviso: (m: string) => void }) {
  const [filtro, setFiltro] = useState<EstadoDocumentoFiscal | null>(null);
  const [datos, setDatos] = useState<ListaDocumentos | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; modo: "detalle" | "nombre" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useImpresion<{ doc: DocumentoFiscalDetalle; qr: string | null }>();
  const [resaltado, lectorResaltado] = useResaltado(["documento"]);
  const todas = useVerTodas();

  const cargar = useCallback(() => {
    apiFetch<ListaDocumentos>(conAlcance(`/facturacion/documentos${filtro ? `?estado=${filtro}` : ""}`, todas), { token })
      .then(setDatos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar los documentos."));
  }, [token, filtro, todas]);

  useEffect(cargar, [cargar]);
  // Mientras haya documentos en trámite, se refresca solo.
  useEffect(() => {
    const enTramite = (datos?.porEstado.PENDIENTE ?? 0) + (datos?.porEstado.ENVIADO ?? 0);
    if (enTramite === 0) return;
    const t = setInterval(cargar, 10_000);
    return () => clearInterval(t);
  }, [datos, cargar]);

  async function accion(hacer: () => Promise<unknown>, aviso: string) {
    setError(null);
    try {
      await hacer();
      onAviso(aviso);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    }
  }

  async function imprimir(id: string) {
    const doc = await apiFetch<DocumentoFiscalDetalle>(`/facturacion/documentos/${id}`, { token });
    const qr = doc.qr ? await QRCode.toDataURL(doc.qr, { width: 240, margin: 1 }).catch(() => null) : null;
    setImprimiendo({ doc, qr });
  }

  const anular = (d: DocumentoFiscalResumen) => {
    const motivo = prompt(`¿Por qué se anula ${d.numeroCompleto}? (queda en la nota ante la DIAN)`);
    if (!motivo) return;
    accion(() => apiFetch(`/facturacion/documentos/${d.id}/anular`, { method: "POST", token, body: JSON.stringify({ motivo }) }), `Se emitió la nota que anula ${d.numeroCompleto}`);
  };

  return (
    <div className="space-y-3">
      {imprimiendo ? (
        <ZonaImpresion>
          <RepresentacionGrafica doc={imprimiendo.doc} qr={imprimiendo.qr} />
        </ZonaImpresion>
      ) : null}
      {lectorResaltado}
      <div className="flex flex-wrap items-center gap-2">
        {[null, "PENDIENTE", "ENVIADO", "RECHAZADO", "ACEPTADO"].map((e) => (
          <button
            key={e ?? "todos"}
            onClick={() => setFiltro(e as EstadoDocumentoFiscal | null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === e ? "btn-primary" : "bg-muted text-muted-foreground"}`}
          >
            {e ? `${ESTADO_DOCUMENTO_LABEL[e as EstadoDocumentoFiscal]} (${datos?.porEstado[e as EstadoDocumentoFiscal] ?? 0})` : "Todos"}
          </button>
        ))}
        <button
          onClick={() => accion(() => apiFetch("/facturacion/procesar", { method: "POST", token }), "Documentos pendientes enviados")}
          className="ml-auto text-xs font-semibold text-accent"
        >
          Enviar pendientes ahora
        </button>
      </div>
      {error ? <p className="text-sm text-peligro">{error}</p> : null}
      {!datos ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : datos.documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay documentos {filtro ? "en este estado" : "todavía"}.</p>
      ) : (
        <ul className="space-y-2">
          {datos.documentos.map((d) => (
            <li
              key={d.id}
              data-resaltado={resaltado.documento === d.id}
              className={`rounded-2xl border border-border p-3 text-sm bg-surface shadow-suave ${resaltado.documento === d.id ? CLASE_RESALTADO : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {TIPO_DOCUMENTO_CORTO[d.tipo]} {d.numeroCompleto}
                    {d.anula ? <span className="ml-1 text-xs font-normal text-muted-foreground">anula {d.anula}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatoFechaHora(d.creadoEn)} · {todas ? `${d.sede} · ` : ""}{d.ubicacion} · {d.clienteNombre} ({d.clienteIdentificacion}) · {formatoPesos(d.total)}
                  </p>
                  {d.anuladoPor ? (
                    <p className="text-xs text-muted-foreground">
                      Anulado con {d.anuladoPor.numeroCompleto} ({ESTADO_DOCUMENTO_LABEL[d.anuladoPor.estado].toLowerCase()})
                    </p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[d.estado]}`}>{ESTADO_DOCUMENTO_LABEL[d.estado]}</span>
              </div>
              {d.estado !== "ACEPTADO" && d.mensaje ? <p className="mt-1 text-xs text-aviso">{d.mensaje}</p> : null}
              {d.estado === "RECHAZADO" && d.errores.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-peligro">
                  {d.errores.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {d.estado === "ACEPTADO" ? (
                  <button onClick={() => imprimir(d.id)} className="flex items-center gap-1 font-semibold text-accent">
                    <Printer size={13} /> Imprimir
                  </button>
                ) : null}
                {d.estado === "RECHAZADO" ? (
                  <button onClick={() => accion(() => apiFetch(`/facturacion/documentos/${d.id}/reenviar`, { method: "POST", token }), `${d.numeroCompleto} se volvió a enviar`)} className="font-semibold text-accent">
                    Reenviar (después de corregir)
                  </button>
                ) : null}
                {d.estado === "ACEPTADO" && (d.tipo === "FACTURA" || d.tipo === "POS") && !d.anuladoPor ? (
                  <>
                    <button onClick={() => anular(d)} className="font-semibold text-peligro">
                      Anular
                    </button>
                    {d.clienteIdentificacion === "222222222222" ? (
                      <button onClick={() => setAbierto(abierto?.id === d.id ? null : { id: d.id, modo: "nombre" })} className="font-semibold text-accent">
                        Factura a nombre del cliente
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
              {abierto?.id === d.id && abierto.modo === "nombre" ? (
                <ANombreDe
                  token={token}
                  doc={d}
                  onListo={(m) => {
                    setAbierto(null);
                    onAviso(m);
                    cargar();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
