// Cliente de la API de Alanube / Alegra e-provider para Colombia.
// Documentación: https://developer.alanube.co/v1.0-COL
import type { TipoDocumentoFiscal } from "@prisma/client";

export const URL_SANDBOX = "https://sandbox-api.alegra.com/e-provider/col/v1";
export const URL_PRODUCCION = "https://api.alegra.com/e-provider/col/v1";

const TIEMPO_MAXIMO_MS = 25_000;

// Dónde se crea y se consulta cada tipo de documento.
const RUTAS: Record<TipoDocumentoFiscal, string> = {
  FACTURA: "/invoices",
  POS: "/equivalent-documents/pos",
  NOTA_CREDITO: "/credit-notes",
  NOTA_AJUSTE: "/adjustment-note-equivalent-documents",
};
const RUTAS_CONSULTA: Record<TipoDocumentoFiscal, string> = {
  FACTURA: "/invoices",
  POS: "/equivalent-documents",
  NOTA_CREDITO: "/credit-notes",
  NOTA_AJUSTE: "/adjustment-note-equivalent-documents",
};

// Solo Alegra (sandbox o producción), o una dirección local para las
// pruebas automáticas; nunca un servidor cualquiera.
export function urlPermitida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && (u.hostname === "sandbox-api.alegra.com" || u.hostname === "api.alegra.com")) return true;
    return process.env.NODE_ENV !== "production" && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export interface Conexion {
  url: string;
  token: string;
}

export class ErrorConexionAlanube extends Error {}

export interface RespuestaAlanube {
  status: number;
  data: unknown;
}

async function llamar(conexion: Conexion, metodo: "GET" | "POST", ruta: string, cuerpo?: unknown, idempotencia?: string): Promise<RespuestaAlanube> {
  if (!urlPermitida(conexion.url)) throw new ErrorConexionAlanube("La dirección de Alanube configurada no es válida");
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await fetch(conexion.url.replace(/\/$/, "") + ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        Accept: "application/json",
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: controlador.signal,
    });
    const texto = await res.text();
    let data: unknown = texto;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch {
      // Respuesta que no es JSON (p. ej. una página de error del proxy).
    }
    return { status: res.status, data };
  } catch (err) {
    throw new ErrorConexionAlanube(err instanceof Error && err.name === "AbortError" ? "Alanube no respondió a tiempo" : "No hubo conexión con Alanube");
  } finally {
    clearTimeout(temporizador);
  }
}

export const emitir = (c: Conexion, tipo: TipoDocumentoFiscal, cuerpo: unknown, idempotencia: string) => llamar(c, "POST", RUTAS[tipo], cuerpo, idempotencia);
export const consultar = (c: Conexion, tipo: TipoDocumentoFiscal, id: string) => llamar(c, "GET", `${RUTAS_CONSULTA[tipo]}/${encodeURIComponent(id)}`);
export const crearCompania = (c: Conexion, datos: { name: string; identification: string; dv: string }) =>
  llamar(c, "POST", "/companies", { ...datos, useAlegraCertificate: true });
export const consultarCompania = (c: Conexion, id: string) => llamar(c, "GET", `/companies/${encodeURIComponent(id)}`);

// Estado de un documento en la respuesta de Alanube. La respuesta viene
// envuelta según el tipo ("invoice", "equivalent-document"...), así que se
// busca el objeto que traiga el estado.
export interface EstadoAlanube {
  id: string | null;
  status: string | null;
  legalStatus: string | null;
  codigoUnico: string | null;
  qr: string | null;
  mensaje: string | null;
  errores: string[];
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function leerEstado(data: unknown): EstadoAlanube {
  const raiz = objeto(data) ?? {};
  const doc =
    [raiz.invoice, raiz["equivalent-document"], raiz.equivalentDocument, raiz.creditNote, raiz["credit-note"], raiz.adjustmentNoteEquivalentdocument, raiz["adjustment-note-equivalent-document"], raiz.document]
      .map(objeto)
      .find((o) => o && ("status" in o || "legalStatus" in o || "id" in o)) ?? raiz;
  const texto = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const gobierno = objeto(doc.governmentResponse);
  const errores = [
    ...(Array.isArray(gobierno?.errorMessages) ? (gobierno!.errorMessages as unknown[]).map(String) : []),
    ...(Array.isArray(doc.errors) ? (doc.errors as unknown[]).map((e) => (objeto(e)?.message ? String(objeto(e)!.message) : String(e))) : []),
    ...(Array.isArray(raiz.errors) && raiz !== doc ? (raiz.errors as unknown[]).map((e) => (objeto(e)?.message ? String(objeto(e)!.message) : String(e))) : []),
  ];
  return {
    id: texto(doc.id),
    status: texto(doc.status),
    legalStatus: texto(doc.legalStatus),
    codigoUnico: texto(doc.cufe) ?? texto(doc.cude),
    qr: texto(doc.qrCodeContent),
    mensaje: texto(gobierno?.message) ?? texto(raiz.message) ?? texto(doc.message),
    errores,
  };
}
