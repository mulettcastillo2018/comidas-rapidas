import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminGeneral } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { ubicacionDe } from "../lib/ubicacion";
import { consultarCompania, crearCompania, leerEstado, urlPermitida, URL_SANDBOX } from "../services/facturacion/alanube";
import { adquirienteSchema, MENSAJE_ADQUIRIENTE } from "../services/facturacion/adquiriente";
import { digitoVerificacion } from "../services/facturacion/documento";
import { exigirMismaSede, filtroSedes, sedes, sedesDelReporte } from "../services/sedes";
import {
  anularDocumento,
  avisosDeNumeracion,
  conexionDe,
  configuracionFiscal,
  facturarANombreDe,
  faltantes,
  procesarPendientes,
  reenviarDocumento,
} from "../services/facturacion/servicio";

// Facturación electrónica ante la DIAN por medio de Alanube (solo admin).
export const facturacionRouter = Router();

// Para quien cobra (mesero o caja): si está activa, puede ofrecer la factura
// a nombre del cliente. Va antes del filtro de admin.
facturacionRouter.get(
  "/activa",
  requireAuth,
  catchAsync(async (_req, res) => {
    res.json({ activa: (await configuracionFiscal()).activa });
  })
);

facturacionRouter.use(requireAuth, requireAdmin);

// Numeración de pruebas de la DIAN para el ambiente de habilitación (la que
// usan todos los proveedores). El número inicial se elige al azar dentro del
// rango porque la compañía de pruebas es compartida y un número repetido se
// rechaza.
const NUMERACION_PRUEBAS = {
  feResolucion: "18760000001",
  fePrefijo: "SETP",
  feDesde: 990000000,
  feHasta: 995000000,
  feFechaInicio: "2019-01-19",
  feFechaFin: "2030-01-19",
  feClaveTecnica: "fc8eac422eba16e22ffd8c6f94b3f40a6e38162c",
};

// Lo que ve la pantalla: nunca el token completo. La numeración POS es de
// cada sede (se configura en Sedes): aquí solo se dice qué le falta a la sede
// en la que se está trabajando.
async function vistaConfiguracion(req: Request) {
  const c = await configuracionFiscal();
  const { alanubeToken, ...resto } = c;
  const tokenEntorno = Boolean(process.env.ALANUBE_TOKEN);
  const token = process.env.ALANUBE_TOKEN || alanubeToken;
  const lista = await sedes();
  const sede = lista.find((s) => s.id === req.sedeId) ?? null;
  return {
    ...resto,
    esSandbox: c.alanubeUrl === URL_SANDBOX,
    token: { configurado: Boolean(token), final: token ? token.slice(-4) : null, desdeEntorno: tokenEntorno },
    sede: sede ? { id: sede.id, nombre: sede.nombre } : null,
    faltantes: { FACTURA: faltantes(c, "FACTURA"), POS: faltantes(c, "POS", sede) },
    avisos: avisosDeNumeracion(c, req.sedeFija ? lista.filter((s) => s.id === req.sedeId) : lista),
  };
}

facturacionRouter.get(
  "/configuracion",
  catchAsync(async (req, res) => {
    res.json(await vistaConfiguracion(req));
  })
);

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texto = (max: number) => z.string().trim().min(1).max(max);
const configuracionSchema = z
  .object({
    activa: z.boolean(),
    alanubeUrl: z.string().refine(urlPermitida, "Dirección de Alanube no permitida"),
    // undefined = no cambiar; null = borrar.
    alanubeToken: z.string().trim().min(10).max(4000).nullable().optional(),
    alanubeCompanyId: texto(100).nullable(),
    nit: z.string().regex(/^\d{5,15}$/).nullable(),
    dv: z.string().regex(/^\d$/).nullable(),
    razonSocial: texto(450).nullable(),
    documentoPorDefecto: z.enum(["FACTURA", "POS"]),
    impuesto: z.enum(["INC", "IVA", "NINGUNO"]),
    impuestoPct: z.number().int().min(0).max(35),
    feResolucion: texto(14).nullable(),
    fePrefijo: z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/).nullable(),
    feDesde: z.number().int().positive().nullable(),
    feHasta: z.number().int().positive().nullable(),
    feFechaInicio: dia.nullable(),
    feFechaFin: dia.nullable(),
    feClaveTecnica: texto(200).nullable(),
    feSiguiente: z.number().int().positive().nullable(),
    notaPrefijo: z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/),
    ajustePrefijo: z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/),
  })
  .refine((c) => !c.nit || !c.dv || digitoVerificacion(c.nit) === c.dv, { message: "El dígito de verificación no corresponde al NIT" })
  .refine((c) => c.feDesde === null || c.feHasta === null || c.feDesde <= c.feHasta, { message: "El rango de facturación está al revés" })
  .refine((c) => c.feSiguiente === null || c.feDesde === null || c.feHasta === null || (c.feSiguiente >= c.feDesde && c.feSiguiente <= c.feHasta + 1), {
    message: "El siguiente número de factura está fuera del rango",
  });

// La configuración es del negocio (un NIT, una conexión): solo el
// administrador general la cambia.

facturacionRouter.put(
  "/configuracion",
  requireAdminGeneral,
  catchAsync(async (req, res) => {
    const parsed = configuracionSchema.safeParse(req.body);
    if (!parsed.success) {
      const { formErrors, fieldErrors } = parsed.error.flatten();
      const campo = Object.keys(fieldErrors)[0];
      throw new ErrorDeNegocio(formErrors[0] ?? (campo ? `Revisa el campo "${campo}"` : "Revisa la configuración"), 400);
    }
    const { alanubeToken, ...datos } = parsed.data;
    const actual = await configuracionFiscal();
    // Sin "siguiente número": se sigue donde iba; si cambió el prefijo (nueva
    // resolución), empieza en el inicio del rango.
    if (datos.feSiguiente === null) datos.feSiguiente = datos.fePrefijo === actual.fePrefijo ? actual.feSiguiente : null;
    // Al activarla empieza a contar: lo cobrado antes no se factura.
    const activadaEn = datos.activa && !actual.activa ? new Date() : datos.activa ? actual.activadaEn : actual.activadaEn;
    await prisma.configuracionFiscal.update({
      where: { id: "unica" },
      data: { ...datos, activadaEn, ...(alanubeToken !== undefined ? { alanubeToken } : {}) },
    });
    res.json(await vistaConfiguracion(req));
  })
);

// Carga la numeración de pruebas de la DIAN (solo en el sandbox).
facturacionRouter.post(
  "/configuracion/numeracion-pruebas",
  requireAdminGeneral,
  catchAsync(async (req, res) => {
    const c = await configuracionFiscal();
    if (c.alanubeUrl !== URL_SANDBOX && !c.alanubeUrl.startsWith("http://")) throw new ErrorDeNegocio("La numeración de pruebas solo se usa en el ambiente de pruebas", 409);
    const inicio = NUMERACION_PRUEBAS.feDesde + Math.floor(Math.random() * 4_000_000);
    await prisma.configuracionFiscal.update({ where: { id: "unica" }, data: { ...NUMERACION_PRUEBAS, feSiguiente: inicio } });
    res.json(await vistaConfiguracion(req));
  })
);

// Da de alta la empresa en Alanube con el NIT configurado y guarda su id.
facturacionRouter.post(
  "/configuracion/compania",
  requireAdminGeneral,
  catchAsync(async (req, res) => {
    const c = await configuracionFiscal();
    const conexion = conexionDe(c);
    if (!conexion) throw new ErrorDeNegocio("Primero guarda el token de Alanube", 409);
    if (!c.nit || !c.dv || !c.razonSocial) throw new ErrorDeNegocio("Primero guarda el NIT, el dígito de verificación y la razón social", 409);
    const r = await crearCompania(conexion, { name: c.razonSocial, identification: c.nit, dv: c.dv });
    const cuerpo = r.data as Record<string, unknown> | null;
    const compania = (cuerpo?.company ?? cuerpo) as Record<string, unknown> | null;
    const id = typeof compania?.id === "string" ? compania.id : null;
    if (r.status >= 300 || !id) {
      const e = leerEstado(r.data);
      throw new ErrorDeNegocio(`Alanube no creó la compañía (${r.status}): ${e.mensaje ?? e.errores[0] ?? "sin detalle"}`, 502);
    }
    await prisma.configuracionFiscal.update({ where: { id: "unica" }, data: { alanubeCompanyId: id } });
    res.json(await vistaConfiguracion(req));
  })
);

// Prueba el token y la compañía.
facturacionRouter.post(
  "/configuracion/probar",
  catchAsync(async (_req, res) => {
    const c = await configuracionFiscal();
    const conexion = conexionDe(c);
    if (!conexion) throw new ErrorDeNegocio("Falta el token de Alanube", 409);
    if (!c.alanubeCompanyId) throw new ErrorDeNegocio("Falta el id de la compañía en Alanube", 409);
    const r = await consultarCompania(conexion, c.alanubeCompanyId);
    if (r.status === 401 || r.status === 403) throw new ErrorDeNegocio("Alanube no aceptó el token", 409);
    if (r.status === 404) throw new ErrorDeNegocio("Alanube no encontró esa compañía", 409);
    if (r.status >= 300) throw new ErrorDeNegocio(`Alanube respondió ${r.status}`, 502);
    res.json({ ok: true, mensaje: "Conexión con Alanube correcta" });
  })
);

const ESTADOS = ["PENDIENTE", "ENVIADO", "ACEPTADO", "RECHAZADO"] as const;

function resumen(d: Prisma.DocumentoFiscalGetPayload<{ include: typeof incluirDocumento }>) {
  const f = d.factura;
  return {
    id: d.id,
    tipo: d.tipo,
    numeroCompleto: `${d.prefijo}${d.numero}`,
    estado: d.estado,
    mensaje: d.mensaje,
    errores: d.errores,
    codigoUnico: d.codigoUnico,
    qr: d.qr,
    intentos: d.intentos,
    clienteNombre: d.clienteNombre,
    clienteIdentificacion: d.clienteIdentificacion,
    total: d.total,
    creadoEn: d.creadoEn,
    facturaId: d.facturaId,
    sede: f.sede.nombre,
    ubicacion: f.mesaSesion ? `Mesa ${f.mesaSesion.mesa.numero}` : f.pedido ? ubicacionDe(f.pedido) : "—",
    anula: d.anula ? `${d.anula.prefijo}${d.anula.numero}` : null,
    anuladoPor: d.anuladoPor ? { numeroCompleto: `${d.anuladoPor.prefijo}${d.anuladoPor.numero}`, estado: d.anuladoPor.estado } : null,
  };
}

const incluirDocumento = {
  anula: { select: { prefijo: true, numero: true } },
  anuladoPor: { select: { prefijo: true, numero: true, estado: true } },
  factura: {
    select: {
      sedeId: true,
      sede: { select: { nombre: true } },
      mesaSesion: { select: { mesa: { select: { numero: true } } } },
      pedido: { select: { canal: true, nombreCliente: true, codigoPlataforma: true, plataforma: { select: { nombre: true } } } },
    },
  },
};

facturacionRouter.get(
  "/documentos",
  catchAsync(async (req, res) => {
    const estado = ESTADOS.find((e) => e === req.query.estado);
    const deLaSede = { factura: filtroSedes(sedesDelReporte(req)) };
    const [documentos, conteo] = await Promise.all([
      prisma.documentoFiscal.findMany({ where: { ...deLaSede, ...(estado ? { estado } : {}) }, include: incluirDocumento, orderBy: { creadoEn: "desc" }, take: 100 }),
      prisma.documentoFiscal.groupBy({ by: ["estado"], where: deLaSede, _count: true }),
    ]);
    res.json({ documentos: documentos.map(resumen), porEstado: Object.fromEntries(conteo.map((c) => [c.estado, c._count])) });
  })
);

// Todo lo necesario para imprimir la representación gráfica.
facturacionRouter.get(
  "/documentos/:id",
  catchAsync(async (req, res) => {
    const d = await prisma.documentoFiscal.findUnique({ where: { id: req.params.id }, include: incluirDocumento });
    if (!d) throw new ErrorDeNegocio("Documento no encontrado", 404);
    exigirMismaSede(req, d.factura.sedeId, "Ese documento");
    const c = await configuracionFiscal();
    res.json({
      ...resumen(d),
      contenido: d.contenido,
      emisor: { razonSocial: c.razonSocial, nit: c.nit, dv: c.dv, impuesto: c.impuesto, impuestoPct: c.impuestoPct },
    });
  })
);

async function documentoDeLaSede(req: Request, id: string) {
  const d = await prisma.documentoFiscal.findUnique({ where: { id }, select: { factura: { select: { sedeId: true } } } });
  if (d) exigirMismaSede(req, d.factura.sedeId, "Ese documento");
}

facturacionRouter.post(
  "/documentos/:id/reenviar",
  catchAsync(async (req, res) => {
    await documentoDeLaSede(req, req.params.id);
    const d = await reenviarDocumento(req.params.id);
    res.json({ id: d.id, estado: d.estado });
  })
);

facturacionRouter.post(
  "/documentos/:id/anular",
  catchAsync(async (req, res) => {
    const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 300) : "";
    if (motivo.length < 5) throw new ErrorDeNegocio("Escribe el motivo de la anulación", 400);
    await documentoDeLaSede(req, req.params.id);
    const nota = await anularDocumento(req.params.id, motivo);
    res.status(201).json({ id: nota.id, numeroCompleto: `${nota.prefijo}${nota.numero}`, estado: nota.estado });
  })
);

// Factura a nombre del cliente de una cuenta ya cobrada.
facturacionRouter.put(
  "/cuentas/:facturaId/adquiriente",
  catchAsync(async (req, res) => {
    const parsed = adquirienteSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio(parsed.error.flatten().formErrors[0] ?? MENSAJE_ADQUIRIENTE, 400);
    const cuenta = await prisma.factura.findUnique({ where: { id: req.params.facturaId }, select: { sedeId: true } });
    if (cuenta) exigirMismaSede(req, cuenta.sedeId, "Esa cuenta");
    const doc = await facturarANombreDe(req.params.facturaId, parsed.data);
    res.status(201).json({ id: doc.id, numeroCompleto: `${doc.prefijo}${doc.numero}`, estado: doc.estado });
  })
);

// Enviar ya lo pendiente (el sistema también lo hace solo cada pocos segundos).
facturacionRouter.post(
  "/procesar",
  catchAsync(async (_req, res) => {
    await procesarPendientes();
    res.json({ ok: true });
  })
);
