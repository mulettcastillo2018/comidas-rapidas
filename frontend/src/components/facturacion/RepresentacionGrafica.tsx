"use client";

import { formatoFechaHora, formatoPesos } from "@/lib/formato";
import { TIPO_DOCUMENTO_LABEL, TIPOS_IDENTIFICACION, type DocumentoFiscalDetalle } from "@/lib/facturacion";

const pesos = (v: number) => formatoPesos(Math.round(v));
const conCentavos = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2 });

// Lo que se imprime y se le entrega al cliente: la versión legible del
// documento electrónico (con su CUFE/CUDE y el QR para verificarlo en la DIAN).
export function RepresentacionGrafica({ doc, qr }: { doc: DocumentoFiscalDetalle; qr: string | null }) {
  const c = doc.contenido;
  const r = c.resolution;
  const impuesto = doc.emisor.impuesto === "NINGUNO" ? null : `${doc.emisor.impuesto} ${doc.emisor.impuestoPct}%`;
  const tipoId = TIPOS_IDENTIFICACION.find((t) => t.codigo === c.customer.identificationType)?.nombre ?? "Identificación";
  return (
    <div className="mx-auto max-w-xs text-xs">
      <p className="text-center text-sm font-bold">{doc.emisor.razonSocial}</p>
      <p className="text-center">
        NIT {doc.emisor.nit}-{doc.emisor.dv}
      </p>
      <p className="mt-2 text-center font-semibold">{TIPO_DOCUMENTO_LABEL[doc.tipo]}</p>
      <p className="text-center text-sm font-bold">No. {doc.numeroCompleto}</p>
      <p className="text-center">{formatoFechaHora(doc.creadoEn)}</p>
      {doc.anula ? <p className="text-center">Anula el documento {doc.anula}</p> : null}
      <div className="mt-2 border-t border-dashed border-foreground pt-1">
        <p>
          Cliente: <strong>{c.customer.name}</strong>
        </p>
        <p>
          {tipoId}: {c.customer.identificationNumber}
          {c.customer.dv ? `-${c.customer.dv}` : ""}
        </p>
      </div>
      <div className="mt-2 space-y-0.5 border-y border-dashed border-foreground py-1">
        {c.items.map((i, n) => (
          <div key={n} className="flex justify-between gap-2">
            <span>
              {i.quantity}× {i.description}
            </span>
            <span className="shrink-0">{conCentavos(i.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal (base)</span>
          <span>{conCentavos(c.totalAmounts.grossTotal)}</span>
        </div>
        {impuesto ? (
          <div className="flex justify-between">
            <span>{impuesto}</span>
            <span>{conCentavos(c.totalAmounts.taxTotal)}</span>
          </div>
        ) : null}
        {c.totalAmounts.chargeTotal > 0 ? (
          <div className="flex justify-between">
            <span>Propina voluntaria</span>
            <span>{conCentavos(c.totalAmounts.chargeTotal)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>{pesos(c.totalAmounts.payableTotal)}</span>
        </div>
      </div>
      {r ? (
        <p className="mt-2 text-[10px]">
          Autorización de numeración DIAN No. {r.resolutionNumber} del {r.startDate}, prefijo {r.prefix} del {r.minNumber} al {r.maxNumber}, vigente hasta {r.endDate}.
        </p>
      ) : null}
      <p className="mt-2 break-all text-[10px]">
        {doc.tipo === "FACTURA" || doc.tipo === "NOTA_CREDITO" ? "CUFE" : "CUDE"}: {doc.codigoUnico}
      </p>
      {qr ? (
        <div className="mt-2 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="" className="h-28 w-28" />
        </div>
      ) : null}
      <p className="mt-2 text-center text-[10px]">Proveedor tecnológico: Soluciones Alegra S.A.S. (Alanube)</p>
    </div>
  );
}
