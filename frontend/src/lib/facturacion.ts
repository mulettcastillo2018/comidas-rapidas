// Facturación electrónica (DIAN, por medio de Alanube).

export type TipoDocumentoFiscal = "FACTURA" | "POS" | "NOTA_CREDITO" | "NOTA_AJUSTE";
export type EstadoDocumentoFiscal = "PENDIENTE" | "ENVIADO" | "ACEPTADO" | "RECHAZADO";

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumentoFiscal, string> = {
  FACTURA: "Factura electrónica de venta",
  POS: "Documento equivalente electrónico POS",
  NOTA_CREDITO: "Nota crédito",
  NOTA_AJUSTE: "Nota de ajuste al documento POS",
};

export const TIPO_DOCUMENTO_CORTO: Record<TipoDocumentoFiscal, string> = {
  FACTURA: "Factura",
  POS: "POS",
  NOTA_CREDITO: "Nota crédito",
  NOTA_AJUSTE: "Nota de ajuste",
};

export const ESTADO_DOCUMENTO_LABEL: Record<EstadoDocumentoFiscal, string> = {
  PENDIENTE: "Por enviar",
  ENVIADO: "Esperando a la DIAN",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
};

export const TIPOS_IDENTIFICACION: { codigo: string; nombre: string }[] = [
  { codigo: "13", nombre: "Cédula de ciudadanía" },
  { codigo: "31", nombre: "NIT" },
  { codigo: "22", nombre: "Cédula de extranjería" },
  { codigo: "41", nombre: "Pasaporte" },
  { codigo: "12", nombre: "Tarjeta de identidad" },
];

export interface Adquiriente {
  tipoIdentificacion: string;
  numero: string;
  dv?: string | null;
  nombre: string;
  email?: string | null;
}

// Dígito de verificación del NIT (algoritmo de la DIAN).
export function digitoVerificacion(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digitos = nit.replace(/\D/g, "").split("").reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0);
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}

// Mismas reglas que el servidor; null = válido.
export function problemaAdquiriente(a: Adquiriente): string | null {
  if (!/^[0-9A-Za-z]{3,20}$/.test(a.numero)) return "Escribe el número de documento (sin puntos ni guiones)";
  if (a.nombre.trim().length < 3) return "Escribe el nombre o la razón social";
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return "El correo no es válido";
  return null;
}

export interface DocumentoFiscalResumen {
  id: string;
  tipo: TipoDocumentoFiscal;
  numeroCompleto: string;
  estado: EstadoDocumentoFiscal;
  mensaje: string | null;
  errores: string[];
  codigoUnico: string | null;
  qr: string | null;
  intentos: number;
  clienteNombre: string;
  clienteIdentificacion: string;
  total: number;
  creadoEn: string;
  facturaId: string;
  ubicacion: string;
  sede: string;
  anula: string | null;
  anuladoPor: { numeroCompleto: string; estado: EstadoDocumentoFiscal } | null;
}

export interface DocumentoFiscalDetalle extends DocumentoFiscalResumen {
  contenido: {
    number: number | string;
    resolution?: { resolutionNumber: string; prefix: string; minNumber: number; maxNumber: number; startDate: string; endDate: string };
    customer: { name: string; identificationType: string; identificationNumber: string; dv?: string };
    items: { description: string; quantity: number; price: number; discountAmount?: number; subtotal: number; taxAmount: number; total: number }[];
    totalAmounts: { grossTotal: number; taxTotal: number; chargeTotal: number; payableTotal: number };
    note?: string[];
  };
  emisor: { razonSocial: string | null; nit: string | null; dv: string | null; impuesto: "INC" | "IVA" | "NINGUNO"; impuestoPct: number };
}

export interface ConfiguracionFiscal {
  activa: boolean;
  activadaEn: string | null;
  alanubeUrl: string;
  esSandbox: boolean;
  token: { configurado: boolean; final: string | null; desdeEntorno: boolean };
  alanubeCompanyId: string | null;
  nit: string | null;
  dv: string | null;
  razonSocial: string | null;
  documentoPorDefecto: "FACTURA" | "POS";
  impuesto: "INC" | "IVA" | "NINGUNO";
  impuestoPct: number;
  feResolucion: string | null;
  fePrefijo: string | null;
  feDesde: number | null;
  feHasta: number | null;
  feFechaInicio: string | null;
  feFechaFin: string | null;
  feClaveTecnica: string | null;
  feSiguiente: number | null;
  notaPrefijo: string;
  ajustePrefijo: string;
  // La sede en la que se está: la numeración POS y la caja son de cada sede.
  sede: { id: string; nombre: string } | null;
  faltantes: { FACTURA: string[]; POS: string[] };
  avisos: string[];
}

export const URL_SANDBOX = "https://sandbox-api.alegra.com/e-provider/col/v1";
export const URL_PRODUCCION = "https://api.alegra.com/e-provider/col/v1";
