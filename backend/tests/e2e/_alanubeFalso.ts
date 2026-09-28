import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

// Imita la API de Alanube para Colombia (https://developer.alanube.co/v1.0-COL)
// en lo que usa el sistema, para probar la integración sin credenciales:
// - Bearer token obligatorio.
// - Idempotency-Key UUID v4; repetirla con el mismo cuerpo devuelve la misma
//   respuesta (y nunca crea dos documentos).
// - La emisión es asíncrona: al enviar queda WAITING_RESPONSE y al consultar
//   ya trae la respuesta de la DIAN (ACCEPTED con CUFE/CUDE y QR).
// - Si el cliente se llama "...RECHAZAR", la DIAN rechaza la primera vez ese
//   número (para probar el reenvío).
// - `caido = n`: responde 503 a las próximas n solicitudes.
export const TOKEN_PRUEBA = "token-de-prueba-e2e-alanube";

const RUTAS: Record<string, string> = {
  "/invoices": "invoice",
  "/equivalent-documents/pos": "equivalent-document",
  "/credit-notes": "credit-note",
  "/adjustment-note-equivalent-documents": "adjustment-note-equivalent-document",
};
const CONSULTAS: Record<string, string> = {
  "/invoices": "invoice",
  "/equivalent-documents": "equivalent-document",
  "/credit-notes": "credit-note",
  "/adjustment-note-equivalent-documents": "adjustment-note-equivalent-document",
};

interface Emitido {
  id: string;
  ruta: string;
  cuerpo: Record<string, any>;
  rechazar: boolean;
}

export interface AlanubeFalso {
  url: string;
  recibidos: { ruta: string; clave: string; cuerpo: Record<string, any> }[];
  repeticiones: number;
  caido: number;
  cerrar: () => Promise<void>;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cerca = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Validaciones básicas de cuadre, como las que haría la DIAN.
function problemas(cuerpo: Record<string, any>): string[] {
  const p: string[] = [];
  if (!cuerpo.company?.id) p.push("company.id es obligatorio");
  if (!Array.isArray(cuerpo.items) || cuerpo.items.length === 0) p.push("items es obligatorio");
  if (!Array.isArray(cuerpo.payments) || cuerpo.payments.length === 0) p.push("payments es obligatorio");
  const t = cuerpo.totalAmounts ?? {};
  const bruto = (cuerpo.items ?? []).reduce((s: number, i: any) => s + i.subtotal, 0);
  const impuestos = (cuerpo.items ?? []).reduce((s: number, i: any) => s + i.taxAmount, 0);
  if (!cerca(bruto, t.grossTotal)) p.push(`grossTotal ${t.grossTotal} no cuadra con las líneas (${bruto})`);
  if (!cerca(impuestos, t.taxTotal)) p.push(`taxTotal ${t.taxTotal} no cuadra con las líneas (${impuestos})`);
  if (!cerca(t.grossTotal + t.taxTotal + (t.chargeTotal ?? 0) - (t.discountTotal ?? 0), t.payableTotal)) p.push("payableTotal no cuadra");
  for (const i of cuerpo.items ?? []) {
    if (!cerca(i.price * i.quantity - (i.discountAmount ?? 0), i.subtotal)) p.push(`subtotal de "${i.description}" no cuadra`);
    for (const tx of i.taxes ?? []) if (!cerca((tx.taxableAmount * Number(tx.taxPercentage)) / 100, tx.taxAmount)) p.push(`impuesto de "${i.description}" mal calculado`);
  }
  return p;
}

export async function iniciarAlanubeFalso(puerto = 4099): Promise<AlanubeFalso> {
  const emitidos = new Map<string, Emitido>();
  const respuestas = new Map<string, { cuerpo: string; status: number; hash: string }>();
  const numerosRechazados = new Set<string>();
  const estado: AlanubeFalso = { url: `http://localhost:${puerto}`, recibidos: [], repeticiones: 0, caido: 0, cerrar: async () => {} };

  const servidor: Server = createServer((req, res) => {
    let datos = "";
    req.on("data", (c) => (datos += c));
    req.on("end", () => {
      const responder = (status: number, cuerpo: unknown, extra: Record<string, string> = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...extra });
        res.end(JSON.stringify(cuerpo));
      };
      if (req.headers.authorization !== `Bearer ${TOKEN_PRUEBA}`) return responder(401, { message: "Unauthorized" });
      if (estado.caido > 0) {
        estado.caido--;
        return responder(503, { message: "Servicio no disponible" });
      }
      const ruta = (req.url ?? "").split("?")[0];

      if (req.method === "POST" && ruta === "/companies") return responder(201, { id: "compania-e2e", name: JSON.parse(datos).name });
      if (req.method === "GET" && ruta === "/companies/compania-e2e") return responder(200, { id: "compania-e2e" });

      if (req.method === "POST" && RUTAS[ruta]) {
        const clave = String(req.headers["idempotency-key"] ?? "");
        if (!UUID_V4.test(clave)) return responder(400, { errors: [{ code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key debe ser UUID v4" }] });
        const previa = respuestas.get(clave);
        if (previa) {
          if (previa.hash !== datos) return responder(422, { errors: [{ code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", message: "Otro contenido" }] });
          estado.repeticiones++;
          res.writeHead(previa.status, { "Content-Type": "application/json", "Idempotent-Replayed": "true" });
          return res.end(previa.cuerpo);
        }
        const cuerpo = JSON.parse(datos);
        estado.recibidos.push({ ruta, clave, cuerpo });
        const errores = problemas(cuerpo);
        if (errores.length > 0) return responder(400, { errors: errores.map((message) => ({ code: "VALIDATION", message })) });
        const numero = `${cuerpo.resolution?.prefix ?? ""}${cuerpo.number}`;
        const rechazar = /RECHAZAR/.test(cuerpo.customer?.name ?? "") && !numerosRechazados.has(numero);
        if (rechazar) numerosRechazados.add(numero);
        const id = randomUUID();
        emitidos.set(id, { id, ruta, cuerpo, rechazar });
        const respuesta = JSON.stringify({ [RUTAS[ruta]]: { id, status: "WAITING_RESPONSE", fullNumber: numero } });
        respuestas.set(clave, { cuerpo: respuesta, status: 201, hash: datos });
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(respuesta);
      }

      if (req.method === "GET") {
        const base = Object.keys(CONSULTAS).find((r) => ruta.startsWith(`${r}/`));
        const doc = base ? emitidos.get(ruta.slice(base.length + 1)) : undefined;
        if (!base || !doc) return responder(404, { message: "No encontrado" });
        const codigo = doc.ruta === "/invoices" || doc.ruta === "/credit-notes" ? { cufe: `cufe-${doc.id}` } : { cude: `cude-${doc.id}` };
        return responder(200, {
          [CONSULTAS[base]]: doc.rechazar
            ? { id: doc.id, status: "SENT", legalStatus: "REJECTED", governmentResponse: { code: "99", message: "Documento con errores", errorMessages: ["Regla: FAK24, Rechazo: dato del adquiriente no válido"] } }
            : { id: doc.id, status: "SENT", legalStatus: "ACCEPTED", ...codigo, qrCodeContent: `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${doc.id}`, governmentResponse: { code: "00", message: "Procesado Correctamente." } },
        });
      }
      responder(404, { message: "Ruta no encontrada" });
    });
  });
  await new Promise<void>((resolve) => servidor.listen(puerto, resolve));
  estado.cerrar = () => new Promise<void>((resolve) => servidor.close(() => resolve()));
  return estado;
}
