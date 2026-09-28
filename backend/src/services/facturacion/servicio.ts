import { randomUUID } from "node:crypto";
import { Prisma, type ConfiguracionFiscal, type DocumentoFiscal, type TipoDocumentoFiscal } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ErrorDeNegocio } from "../../lib/errores";
import { diaLocal } from "../../lib/fechas";
import { nombreCompleto } from "../../lib/nombre";
import { ubicacionDe } from "../../lib/ubicacion";
import { enlaces, notificarPorRol } from "../notificaciones";
import { consultar, emitir, ErrorConexionAlanube, leerEstado, type Conexion, type RespuestaAlanube } from "./alanube";
import { construirDocumento, CONSUMIDOR_FINAL, type Adquiriente, type LineaVenta, type Resolucion } from "./documento";

const INTERVALO_MS = 20_000;
// Espera antes de reintentar un envío o volver a preguntar por la respuesta
// de la DIAN, según cuántas veces se ha intentado.
const ESPERAS_MS = [5_000, 15_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000];
const espera = (intentos: number) => ESPERAS_MS[Math.min(intentos, ESPERAS_MS.length - 1)];
// Si la emisión falla del lado de Alanube/DIAN más de estas veces, se deja
// rechazada para que alguien la revise.
const MAX_FALLOS = 5;
// Avisos de numeración: cuando quedan pocos números o la resolución vence.
const NUMEROS_MINIMOS = 200;
const DIAS_AVISO_VENCIMIENTO = 30;

export async function configuracionFiscal() {
  return prisma.configuracionFiscal.upsert({ where: { id: "unica" }, create: {}, update: {} });
}

// El token puede venir del entorno (recomendado en producción) o guardarse
// desde la pantalla de configuración.
export function conexionDe(config: ConfiguracionFiscal): Conexion | null {
  const token = process.env.ALANUBE_TOKEN || config.alanubeToken;
  return token ? { url: config.alanubeUrl, token } : null;
}

// ---------------------------------------------------------------------------
// Numeración

interface Rango {
  prefijo: string;
  desde: number | null;
  hasta: number | null;
  siguiente: number | null;
  resolucion: Resolucion | null;
  campoSiguiente: keyof Pick<ConfiguracionFiscal, "feSiguiente" | "posSiguiente" | "notaSiguiente" | "ajusteSiguiente">;
}

function resolucionFe(c: ConfiguracionFiscal, prefijo = c.fePrefijo ?? ""): Resolucion | null {
  if (!c.feResolucion || !c.fePrefijo || c.feDesde === null || c.feHasta === null || !c.feFechaInicio || !c.feFechaFin) return null;
  return { numero: c.feResolucion, prefijo, desde: c.feDesde, hasta: c.feHasta, fechaInicio: c.feFechaInicio, fechaFin: c.feFechaFin, claveTecnica: c.feClaveTecnica };
}

function resolucionPos(c: ConfiguracionFiscal): Resolucion | null {
  if (!c.posResolucion || !c.posPrefijo || c.posDesde === null || c.posHasta === null || !c.posFechaInicio || !c.posFechaFin) return null;
  return { numero: c.posResolucion, prefijo: c.posPrefijo, desde: c.posDesde, hasta: c.posHasta, fechaInicio: c.posFechaInicio, fechaFin: c.posFechaFin };
}

function rangoDe(c: ConfiguracionFiscal, tipo: TipoDocumentoFiscal): Rango {
  switch (tipo) {
    case "FACTURA":
      return { prefijo: c.fePrefijo ?? "", desde: c.feDesde, hasta: c.feHasta, siguiente: c.feSiguiente, resolucion: resolucionFe(c), campoSiguiente: "feSiguiente" };
    case "POS":
      return { prefijo: c.posPrefijo ?? "", desde: c.posDesde, hasta: c.posHasta, siguiente: c.posSiguiente, resolucion: resolucionPos(c), campoSiguiente: "posSiguiente" };
    case "NOTA_CREDITO":
      // Alanube pide la resolución también en la nota crédito: la de facturas.
      return { prefijo: c.notaPrefijo, desde: 1, hasta: null, siguiente: c.notaSiguiente, resolucion: resolucionFe(c, c.notaPrefijo), campoSiguiente: "notaSiguiente" };
    case "NOTA_AJUSTE":
      return { prefijo: c.ajustePrefijo, desde: 1, hasta: null, siguiente: c.ajusteSiguiente, resolucion: null, campoSiguiente: "ajusteSiguiente" };
  }
}

// Qué falta para poder emitir ese tipo de documento (vacío = listo).
export function faltantes(c: ConfiguracionFiscal, tipo: TipoDocumentoFiscal): string[] {
  const falta: string[] = [];
  if (!conexionDe(c)) falta.push("el token de Alanube");
  if (!c.alanubeCompanyId) falta.push("la compañía en Alanube");
  const r = rangoDe(c, tipo);
  if ((tipo === "FACTURA" || tipo === "POS" || tipo === "NOTA_CREDITO") && !r.resolucion) {
    falta.push(tipo === "POS" ? "la resolución de numeración POS" : "la resolución de facturación electrónica");
  }
  if (tipo === "FACTURA" && !c.feClaveTecnica) falta.push("la clave técnica de la resolución");
  if (tipo === "POS" && (!c.cajaPlaca || !c.cajaUbicacion)) falta.push("los datos de la caja (placa y ubicación)");
  return falta;
}

// Toma el siguiente número del rango, bloqueando la configuración para que
// dos cobros al mismo tiempo no reciban el mismo número.
async function asignarNumero(tx: Prisma.TransactionClient, tipo: TipoDocumentoFiscal) {
  await tx.$queryRaw`SELECT id FROM "ConfiguracionFiscal" WHERE id = 'unica' FOR UPDATE`;
  const c = await tx.configuracionFiscal.findUniqueOrThrow({ where: { id: "unica" } });
  const falta = faltantes(c, tipo);
  if (falta.length > 0) throw new ErrorDeNegocio(`Para facturar electrónicamente falta configurar: ${falta.join(", ")}.`, 409);
  const r = rangoDe(c, tipo);
  const numero = r.siguiente ?? r.desde ?? 1;
  if (r.hasta !== null && numero > r.hasta) throw new ErrorDeNegocio(`Se acabó la numeración autorizada (${r.prefijo} hasta ${r.hasta}). Pide una nueva resolución a la DIAN.`, 409);
  if (r.resolucion && r.resolucion.fechaFin < diaLocal(new Date())) throw new ErrorDeNegocio(`La resolución ${r.resolucion.numero} venció el ${r.resolucion.fechaFin}.`, 409);
  await tx.configuracionFiscal.update({ where: { id: "unica" }, data: { [r.campoSiguiente]: numero + 1 } });
  return { config: c, prefijo: r.prefijo, numero, resolucion: r.resolucion };
}

// ---------------------------------------------------------------------------
// Contenido

const itemsVendidos = {
  where: { estado: { not: "CANCELADO" as const } },
  include: { producto: { select: { id: true, nombre: true } }, adiciones: { select: { nombre: true } } },
};

async function datosDeVenta(facturaId: string) {
  const f = await prisma.factura.findUniqueOrThrow({
    where: { id: facturaId },
    include: {
      pagos: { select: { metodo: true, monto: true } },
      cerradaPor: { select: { nombre: true, apellido: true } },
      cliente: { select: { telefono: true, nombre: true, puntos: true, eliminadoEn: true } },
      mesaSesion: { include: { mesa: true, pedidos: { include: { items: itemsVendidos } } } },
      pedido: { include: { items: itemsVendidos, plataforma: { select: { nombre: true } } } },
    },
  });
  const items = f.mesaSesion ? f.mesaSesion.pedidos.flatMap((p) => p.items) : (f.pedido?.items ?? []);
  // Una línea por producto (con sus adiciones) y precio: así el documento no
  // repite "Gaseosa" cinco veces.
  const lineas = new Map<string, LineaVenta>();
  for (const i of items) {
    const extras = i.adiciones.map((a) => a.nombre);
    const descripcion = `${i.producto.nombre}${extras.length ? ` + ${extras.join(", ")}` : ""}${i.comboNombre ? ` (${i.comboNombre})` : ""}`;
    const clave = `${descripcion}|${i.precioUnitario}`;
    const linea = lineas.get(clave) ?? { descripcion, codigo: i.producto.id, cantidad: 0, precioUnitario: i.precioUnitario };
    linea.cantidad += i.cantidad;
    lineas.set(clave, linea);
  }
  const ubicacion = f.mesaSesion ? `Mesa ${f.mesaSesion.mesa.numero}` : f.pedido ? ubicacionDe(f.pedido) : "Venta";
  return {
    factura: f,
    lineas: [...lineas.values()],
    nota: `${ubicacion} · cuenta ${f.id.slice(-8)}`,
    cajero: nombreCompleto(f.cerradaPor) || "Caja",
  };
}

function adquirienteDe(valor: Prisma.JsonValue | null): Adquiriente | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const a = valor as Record<string, unknown>;
  if (typeof a.numero !== "string" || typeof a.nombre !== "string" || typeof a.tipoIdentificacion !== "string") return null;
  return { tipoIdentificacion: a.tipoIdentificacion, numero: a.numero, nombre: a.nombre, dv: (a.dv as string) ?? null, email: (a.email as string) ?? null };
}

// El adquiriente que quedó en un documento ya enviado (para que la nota que
// lo anula vaya a nombre de la misma persona).
function adquirienteDelContenido(contenido: Prisma.JsonValue): Adquiriente {
  const cliente = (contenido as { customer?: Record<string, unknown> } | null)?.customer;
  if (!cliente) return CONSUMIDOR_FINAL;
  return {
    tipoIdentificacion: String(cliente.identificationType),
    numero: String(cliente.identificationNumber),
    nombre: String(cliente.name),
    dv: (cliente.dv as string) ?? null,
    email: (cliente.email as string) ?? null,
  };
}

async function armarContenido(
  config: ConfiguracionFiscal,
  facturaId: string,
  tipo: TipoDocumentoFiscal,
  numeracion: { prefijo: string; numero: number; resolucion: Resolucion | null },
  adquiriente: Adquiriente,
  extra: { referencia?: DocumentoFiscal; motivo?: string } = {}
) {
  const { factura, lineas, nota, cajero } = await datosDeVenta(facturaId);
  const contenido = construirDocumento({
    tipo,
    numero: numeracion.numero,
    prefijo: numeracion.prefijo,
    resolucion: numeracion.resolucion,
    companyId: config.alanubeCompanyId ?? "",
    impuesto: config.impuesto,
    impuestoPct: config.impuestoPct,
    adquiriente,
    lineas,
    descuento: factura.descuentoMonto,
    propina: factura.propinaMonto,
    envio: factura.envioMonto,
    pagos: factura.pagos,
    nota,
    caja: { placa: config.cajaPlaca ?? "", ubicacion: config.cajaUbicacion ?? "", cajero, codigoVenta: factura.id.slice(-8) },
    ...(factura.cliente && !factura.cliente.eliminadoEn
      ? { beneficios: { identificacion: factura.cliente.telefono, nombre: factura.cliente.nombre, puntos: factura.cliente.puntos } }
      : {}),
    ...(extra.referencia
      ? {
          referencia: {
            alanubeId: extra.referencia.alanubeId,
            numeroCompleto: `${extra.referencia.prefijo}${extra.referencia.numero}`,
            codigoUnico: extra.referencia.codigoUnico,
            fecha: diaLocal(extra.referencia.creadoEn),
            tipo: extra.referencia.tipo,
          },
          motivo: extra.motivo,
        }
      : {}),
  });
  return { contenido, total: factura.total };
}

// ---------------------------------------------------------------------------
// Crear, enviar y consultar

// Crea el documento de una cuenta cobrada: factura electrónica si el cliente
// la pidió a su nombre; si no, el documento configurado para consumidor final.
// Un número que ya existe (alguien movió el "siguiente número" hacia atrás).
function numeroRepetido(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ErrorDeNegocio("El siguiente número de la numeración ya se usó. Revísalo en Facturación electrónica.", 409);
  }
  throw err;
}

export async function crearDocumento(facturaId: string) {
  const factura = await prisma.factura.findUniqueOrThrow({ where: { id: facturaId }, select: { estado: true, adquiriente: true } });
  if (factura.estado !== "PAGADA") throw new ErrorDeNegocio("Solo se factura una cuenta pagada", 409);
  const adquiriente = adquirienteDe(factura.adquiriente);
  const config = await configuracionFiscal();
  const tipo: TipoDocumentoFiscal = adquiriente ? "FACTURA" : config.documentoPorDefecto;
  const cliente = adquiriente ?? CONSUMIDOR_FINAL;

  const doc = await prisma.$transaction(async (tx) => {
    const numeracion = await asignarNumero(tx, tipo);
    const { contenido, total } = await armarContenido(numeracion.config, facturaId, tipo, numeracion, cliente);
    return tx.documentoFiscal.create({
      data: {
        facturaId,
        tipo,
        prefijo: numeracion.prefijo,
        numero: numeracion.numero,
        contenido: contenido as Prisma.InputJsonValue,
        claveIdempotencia: randomUUID(),
        clienteNombre: cliente.nombre,
        clienteIdentificacion: cliente.numero,
        total,
      },
    });
  }).catch(numeroRepetido);
  await avisarNumeracionBaja(tipo);
  return doc;
}

// Aplica lo que respondió Alanube (al enviar o al consultar).
async function aplicarRespuesta(doc: DocumentoFiscal, r: RespuestaAlanube) {
  const ahora = Date.now();
  const e = leerEstado(r.data);
  const mensajeHttp = e.mensaje ?? (e.errores[0] || `Alanube respondió ${r.status}`);

  // Otra solicitud con la misma clave sigue en curso, o Alanube está caído:
  // se reintenta más tarde, igual.
  if (r.status === 409 || r.status === 429 || r.status >= 500) {
    await prisma.documentoFiscal.update({
      where: { id: doc.id },
      data: { mensaje: mensajeHttp, proximoIntento: new Date(ahora + espera(doc.intentos)) },
    });
    return;
  }
  // Datos que Alanube no acepta (token, compañía, campos): hay que corregir.
  if (r.status >= 400) {
    const errores = e.errores.length > 0 ? e.errores : [typeof r.data === "string" ? r.data.slice(0, 300) : JSON.stringify(r.data).slice(0, 300)];
    await prisma.documentoFiscal.update({ where: { id: doc.id }, data: { estado: "RECHAZADO", mensaje: mensajeHttp, errores } });
    await avisar(`Alanube no aceptó el documento ${doc.prefijo}${doc.numero}: ${mensajeHttp}`, doc.id);
    return;
  }

  const comun = { alanubeId: e.id ?? doc.alanubeId, codigoUnico: e.codigoUnico ?? doc.codigoUnico, qr: e.qr ?? doc.qr, mensaje: e.mensaje, errores: e.errores };
  if (e.legalStatus === "ACCEPTED" || e.legalStatus === "ACCEPTED_WITH_OBSERVATIONS") {
    await prisma.documentoFiscal.update({ where: { id: doc.id }, data: { ...comun, estado: "ACEPTADO" } });
    return;
  }
  if (e.legalStatus === "REJECTED") {
    await prisma.documentoFiscal.update({ where: { id: doc.id }, data: { ...comun, estado: "RECHAZADO" } });
    await avisar(`La DIAN rechazó el documento ${doc.prefijo}${doc.numero}${e.errores[0] ? `: ${e.errores[0]}` : ""}`, doc.id);
    return;
  }
  if (e.status === "FAILED") {
    // "Hay que reenviarlo": con otra clave, porque la misma devolvería el
    // mismo fallo guardado.
    const agotado = doc.intentos >= MAX_FALLOS;
    await prisma.documentoFiscal.update({
      where: { id: doc.id },
      data: agotado
        ? { ...comun, estado: "RECHAZADO" }
        : { ...comun, estado: "PENDIENTE", claveIdempotencia: randomUUID(), proximoIntento: new Date(ahora + espera(doc.intentos)) },
    });
    if (agotado) await avisar(`El documento ${doc.prefijo}${doc.numero} falló ${doc.intentos} veces al emitirse. Revísalo.`, doc.id);
    return;
  }
  // Recibido, esperando a la DIAN: se vuelve a preguntar.
  await prisma.documentoFiscal.update({
    where: { id: doc.id },
    data: { ...comun, estado: comun.alanubeId ? "ENVIADO" : "PENDIENTE", proximoIntento: new Date(ahora + espera(doc.intentos)) },
  });
}

// Reserva el documento para este proceso (y cuenta el intento), para que un
// ciclo que se cruce no lo envíe dos veces.
async function reservar(doc: DocumentoFiscal) {
  const tomado = await prisma.documentoFiscal.updateMany({
    where: { id: doc.id, estado: doc.estado, proximoIntento: { lte: new Date() } },
    data: { proximoIntento: new Date(Date.now() + 2 * 60_000), intentos: { increment: 1 } },
  });
  return tomado.count === 1 ? prisma.documentoFiscal.findUnique({ where: { id: doc.id } }) : null;
}

async function trabajar(doc: DocumentoFiscal, config: ConfiguracionFiscal) {
  const conexion = conexionDe(config);
  if (!conexion) {
    await prisma.documentoFiscal.update({
      where: { id: doc.id },
      data: { mensaje: "Falta el token de Alanube: configúralo en Facturación electrónica", proximoIntento: new Date(Date.now() + 5 * 60_000) },
    });
    return;
  }
  const reservado = await reservar(doc);
  if (!reservado) return;
  try {
    const r =
      reservado.estado === "ENVIADO" && reservado.alanubeId
        ? await consultar(conexion, reservado.tipo, reservado.alanubeId)
        : await emitir(conexion, reservado.tipo, reservado.contenido, reservado.claveIdempotencia);
    await aplicarRespuesta(reservado, r);
  } catch (err) {
    if (!(err instanceof ErrorConexionAlanube)) throw err;
    // Sin internet o Alanube caído: el documento queda pendiente y se envía
    // cuando vuelva la conexión (el cobro no se frena por esto).
    await prisma.documentoFiscal.update({
      where: { id: reservado.id },
      data: { mensaje: err.message, proximoIntento: new Date(Date.now() + espera(reservado.intentos)) },
    });
  }
}

// ---------------------------------------------------------------------------
// Ciclo en segundo plano

const omitidas = new Set<string>();
let enCurso: Promise<void> | null = null;
let otraVez = false;

async function ciclo() {
  const config = await configuracionFiscal();
  if (!config.activa || !config.activadaEn) return;

  const sinDocumento = await prisma.factura.findMany({
    where: { estado: "PAGADA", pagadaEn: { gte: config.activadaEn }, documentosFiscales: { none: {} }, id: { notIn: [...omitidas] } },
    select: { id: true, total: true, propinaMonto: true },
    orderBy: { pagadaEn: "asc" },
    take: 20,
  });
  for (const f of sinDocumento) {
    // Una cortesía total no es una venta: no hay nada que facturar.
    if (f.total - f.propinaMonto <= 0) {
      omitidas.add(f.id);
      continue;
    }
    try {
      await crearDocumento(f.id);
    } catch (err) {
      if (!(err instanceof ErrorDeNegocio)) throw err;
      await avisar(err.message);
      break;
    }
  }

  const porTrabajar = await prisma.documentoFiscal.findMany({
    where: { estado: { in: ["PENDIENTE", "ENVIADO"] }, proximoIntento: { lte: new Date() } },
    orderBy: { proximoIntento: "asc" },
    take: 20,
  });
  for (const doc of porTrabajar) await trabajar(doc, config);
}

// Corre un ciclo ya. Si hay uno corriendo, no se cruza con él: le pide una
// vuelta más y espera a que termine (así quien lo pidió ve el resultado).
export function procesarPendientes(): Promise<void> {
  if (enCurso) {
    otraVez = true;
    return enCurso;
  }
  enCurso = (async () => {
    try {
      do {
        otraVez = false;
        await ciclo();
      } while (otraVez);
    } catch (err) {
      console.error("Error en la facturación electrónica:", err);
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

// Después de un cobro: enviar pronto, sin demorar la respuesta al mesero.
export function programarProcesamiento() {
  setTimeout(() => void procesarPendientes(), 500);
}

export function iniciarFacturacionPeriodica() {
  setInterval(() => void procesarPendientes(), INTERVALO_MS);
}

// ---------------------------------------------------------------------------
// Acciones del admin

// Anula un documento aceptado con la nota que corresponde (nota crédito a
// una factura, nota de ajuste a un POS).
export async function anularDocumento(id: string, motivo: string) {
  const doc = await prisma.documentoFiscal.findUnique({ where: { id }, include: { anuladoPor: true } });
  if (!doc) throw new ErrorDeNegocio("Documento no encontrado", 404);
  if (doc.tipo !== "FACTURA" && doc.tipo !== "POS") throw new ErrorDeNegocio("Una nota no se anula", 400);
  if (doc.estado !== "ACEPTADO") throw new ErrorDeNegocio("Solo se anula un documento que la DIAN ya aceptó", 409);
  if (doc.anuladoPor) throw new ErrorDeNegocio("Este documento ya tiene una nota que lo anula", 409);
  const tipo: TipoDocumentoFiscal = doc.tipo === "FACTURA" ? "NOTA_CREDITO" : "NOTA_AJUSTE";
  const cliente = adquirienteDelContenido(doc.contenido);

  const nota = await prisma.$transaction(async (tx) => {
    const numeracion = await asignarNumero(tx, tipo);
    const { contenido, total } = await armarContenido(numeracion.config, doc.facturaId, tipo, numeracion, cliente, { referencia: doc, motivo });
    return tx.documentoFiscal.create({
      data: {
        facturaId: doc.facturaId,
        tipo,
        prefijo: numeracion.prefijo,
        numero: numeracion.numero,
        contenido: contenido as Prisma.InputJsonValue,
        claveIdempotencia: randomUUID(),
        clienteNombre: cliente.nombre,
        clienteIdentificacion: cliente.numero,
        total,
        anulaId: doc.id,
      },
    });
  }).catch(numeroRepetido);
  programarProcesamiento();
  return nota;
}

// Reenvía un documento rechazado después de corregir la configuración o los
// datos: se arma de nuevo, con el mismo número.
export async function reenviarDocumento(id: string) {
  const doc = await prisma.documentoFiscal.findUnique({ where: { id }, include: { anula: true } });
  if (!doc) throw new ErrorDeNegocio("Documento no encontrado", 404);
  if (doc.estado !== "RECHAZADO") throw new ErrorDeNegocio("Solo se reenvía un documento rechazado", 409);
  const config = await configuracionFiscal();
  const factura = await prisma.factura.findUniqueOrThrow({ where: { id: doc.facturaId }, select: { adquiriente: true } });
  const cliente = doc.anula ? adquirienteDelContenido(doc.anula.contenido) : (adquirienteDe(factura.adquiriente) ?? CONSUMIDOR_FINAL);
  const r = rangoDe(config, doc.tipo);
  const { contenido } = await armarContenido(config, doc.facturaId, doc.tipo, { prefijo: doc.prefijo, numero: doc.numero, resolucion: r.resolucion ? { ...r.resolucion, prefijo: doc.prefijo } : null }, cliente, {
    referencia: doc.anula ?? undefined,
    motivo: doc.anula ? "Anulación" : undefined,
  });
  const actualizado = await prisma.documentoFiscal.update({
    where: { id: doc.id },
    data: {
      estado: "PENDIENTE",
      contenido: contenido as Prisma.InputJsonValue,
      claveIdempotencia: randomUUID(),
      errores: [],
      mensaje: null,
      intentos: 0,
      proximoIntento: new Date(),
      clienteNombre: cliente.nombre,
      clienteIdentificacion: cliente.numero,
    },
  });
  programarProcesamiento();
  return actualizado;
}

// El cliente pide la factura a su nombre después de pagar: si ya se emitió
// a consumidor final y la DIAN la aceptó, se anula y se emite de nuevo.
export async function facturarANombreDe(facturaId: string, adquiriente: Adquiriente) {
  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: { documentosFiscales: { where: { tipo: { in: ["FACTURA", "POS"] } }, include: { anuladoPor: true }, orderBy: { creadoEn: "desc" } } },
  });
  if (!factura) throw new ErrorDeNegocio("Cuenta no encontrada", 404);
  if (factura.estado !== "PAGADA") throw new ErrorDeNegocio("Solo se factura una cuenta pagada", 409);
  const vigente = factura.documentosFiscales.find((d) => !d.anuladoPor && d.estado !== "RECHAZADO");
  if (vigente && (vigente.estado === "PENDIENTE" || vigente.estado === "ENVIADO")) {
    throw new ErrorDeNegocio("El documento de esta cuenta está en trámite con la DIAN. Espera a que responda e intenta de nuevo.", 409);
  }
  await prisma.factura.update({ where: { id: facturaId }, data: { adquiriente: adquiriente as unknown as Prisma.InputJsonValue } });
  if (vigente) await anularDocumento(vigente.id, "Se emite factura electrónica a nombre del cliente");
  const nueva = await crearDocumento(facturaId);
  programarProcesamiento();
  return nueva;
}

// ---------------------------------------------------------------------------
// Avisos

const ultimoAviso = new Map<string, number>();

// Al admin, sin repetir el mismo aviso más de una vez por hora.
async function avisar(mensaje: string, documentoId?: string) {
  const antes = ultimoAviso.get(mensaje);
  if (antes && Date.now() - antes < 60 * 60_000) return;
  ultimoAviso.set(mensaje, Date.now());
  await notificarPorRol({ rol: "ADMIN", tipo: "FACTURACION", mensaje, enlace: enlaces.facturacion(documentoId) });
}

export function avisosDeNumeracion(c: ConfiguracionFiscal): string[] {
  const avisos: string[] = [];
  const hoy = diaLocal(new Date());
  const limite = diaLocal(new Date(Date.now() + DIAS_AVISO_VENCIMIENTO * 86_400_000));
  for (const [nombre, tipo] of [["facturación electrónica", "FACTURA"], ["POS", "POS"]] as const) {
    const r = rangoDe(c, tipo);
    if (!r.resolucion) continue;
    const quedan = r.hasta! - (r.siguiente ?? r.desde!) + 1;
    if (quedan <= 0) avisos.push(`Se acabó la numeración de ${nombre}.`);
    else if (quedan <= NUMEROS_MINIMOS) avisos.push(`Quedan ${quedan} números de ${nombre}: pide una nueva resolución a la DIAN.`);
    if (r.resolucion.fechaFin < hoy) avisos.push(`La resolución de ${nombre} venció el ${r.resolucion.fechaFin}.`);
    else if (r.resolucion.fechaFin <= limite) avisos.push(`La resolución de ${nombre} vence el ${r.resolucion.fechaFin}.`);
  }
  return avisos;
}

async function avisarNumeracionBaja(tipo: TipoDocumentoFiscal) {
  if (tipo !== "FACTURA" && tipo !== "POS") return;
  for (const aviso of avisosDeNumeracion(await configuracionFiscal())) await avisar(aviso);
}
