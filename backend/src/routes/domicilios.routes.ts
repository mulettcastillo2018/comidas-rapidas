import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { crearPedidoEnTx, anunciarPedidoNuevo, pedidoInclude } from "../services/pedidos";
import { cobroSchema, METODOS_PAGO, pagosDelCobro, registrarPagos } from "../services/pagos";
import { avisarAutorizacion, exigirAutorizacion } from "../services/autorizacion";
import { emitPedidoActualizado } from "../realtime/socket";
import type { Prisma } from "@prisma/client";
import { adquirienteDelCobro, MENSAJE_ADQUIRIENTE } from "../services/facturacion/adquiriente";
import { programarProcesamiento } from "../services/facturacion/servicio";

export const domiciliosRouter = Router();
domiciliosRouter.use(requireAuth, requireAdmin);

// Lo que ve el admin en su módulo: el pedido con la entrega y la cuenta.
const incluirDomicilio = {
  ...pedidoInclude,
  domicilio: true,
  factura: { include: { pagos: { select: { metodo: true, monto: true } } } },
};

const itemSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  notas: z.string().trim().min(1).nullable().optional(),
  adicionIds: z.array(z.string().min(1)).max(20).optional(),
});

const texto = (max: number) => z.string().trim().min(1).max(max);

const nuevoSchema = z.discriminatedUnion("canal", [
  z.object({
    canal: z.literal("DOMICILIO"),
    nombreCliente: texto(80),
    telefonoCliente: texto(30),
    direccion: texto(200),
    barrio: texto(80).nullable().optional(),
    indicaciones: texto(300).nullable().optional(),
    envio: z.number().int().min(0).max(200_000),
    // Ley 1581: quien toma el pedido confirma que el cliente autorizó el uso
    // de sus datos para la entrega.
    aceptaDatos: z.literal(true),
    // Si ya pagó (transferencia, Nequi...), con qué; si no, paga al recibir.
    metodoPago: z.enum(METODOS_PAGO).optional(),
    pagaCon: z.number().int().positive().nullable().optional(),
    items: z.array(itemSchema).min(1),
  }),
  z.object({
    canal: z.literal("PLATAFORMA"),
    plataformaId: z.string().min(1),
    codigoPlataforma: texto(40).nullable().optional(),
    nombreCliente: texto(80).nullable().optional(),
    telefonoCliente: texto(30).nullable().optional(),
    items: z.array(itemSchema).min(1),
  }),
]);

// Pedido por teléfono/WhatsApp (domicilio propio) o de una app. Va directo a
// cocina, con su cuenta: la de la app queda pagada (la app le cobró al
// cliente) y la del domicilio queda pendiente hasta que se cobre al entregar,
// salvo que ya haya pagado.
domiciliosRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = nuevoSchema.safeParse(req.body);
    if (!parsed.success) {
      const esDomicilio = req.body?.canal === "DOMICILIO";
      res.status(400).json({
        error: esDomicilio
          ? "Revisa el domicilio: nombre, teléfono, dirección, valor del envío y la autorización de datos del cliente son obligatorios."
          : "Revisa el pedido: elige la app y agrega al menos un producto.",
      });
      return;
    }
    const datos = parsed.data;
    const plataforma = datos.canal === "PLATAFORMA" ? await prisma.plataforma.findUnique({ where: { id: datos.plataformaId } }) : null;
    if (datos.canal === "PLATAFORMA" && (!plataforma || !plataforma.activa)) throw new ErrorDeNegocio("Esa app no está activa", 400);

    const pedidoId = await prisma.$transaction(async (tx) => {
      const id = await crearPedidoEnTx(tx, {
        canal: datos.canal,
        meseroId: req.user!.userId,
        nombreCliente: datos.nombreCliente ?? null,
        telefonoCliente: datos.telefonoCliente ?? null,
        plataformaId: plataforma?.id ?? null,
        codigoPlataforma: datos.canal === "PLATAFORMA" ? (datos.codigoPlataforma ?? null) : null,
        // Todo sale empacado.
        items: datos.items.map((i) => ({ ...i, paraLlevar: true })),
      });
      const lineas = await tx.pedidoItem.findMany({ where: { pedidoId: id }, select: { cantidad: true, precioUnitario: true } });
      const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);

      if (datos.canal === "DOMICILIO") {
        await tx.domicilio.create({
          data: {
            pedidoId: id,
            direccion: datos.direccion,
            barrio: datos.barrio ?? null,
            indicaciones: datos.indicaciones ?? null,
            pagaCon: datos.metodoPago ? null : (datos.pagaCon ?? null),
          },
        });
        const total = subtotal + datos.envio;
        if (!datos.metodoPago && datos.pagaCon && datos.pagaCon < total) {
          throw new ErrorDeNegocio(`Con ${datos.pagaCon.toLocaleString("es-CO")} no alcanza: el total es ${total.toLocaleString("es-CO")}.`, 400);
        }
        const factura = await tx.factura.create({
          data: {
            pedidoId: id,
            subtotal,
            envioMonto: datos.envio,
            total,
            ...(datos.metodoPago ? { estado: "PAGADA", pagadaEn: new Date(), cerradaPorId: req.user!.userId, metodoPago: datos.metodoPago } : {}),
          },
        });
        if (datos.metodoPago) await registrarPagos(tx, factura.id, [{ metodo: datos.metodoPago, monto: total }]);
      } else {
        const factura = await tx.factura.create({
          data: {
            pedidoId: id,
            subtotal,
            total: subtotal,
            comisionMonto: Math.round((subtotal * plataforma!.comisionPct) / 100),
            estado: "PAGADA",
            pagadaEn: new Date(),
            cerradaPorId: req.user!.userId,
            metodoPago: "PLATAFORMA",
          },
        });
        await registrarPagos(tx, factura.id, [{ metodo: "PLATAFORMA", monto: subtotal }]);
      }
      return id;
    });

    await anunciarPedidoNuevo(pedidoId);
    // Las de apps y las ya pagadas se facturan de una vez.
    programarProcesamiento();
    res.status(201).json(await prisma.pedido.findUnique({ where: { id: pedidoId }, include: incluirDomicilio }));
  })
);

// En cocina, listos para salir o en camino.
domiciliosRouter.get(
  "/activos",
  catchAsync(async (_req, res) => {
    const pedidos = await prisma.pedido.findMany({
      where: {
        canal: { in: ["DOMICILIO", "PLATAFORMA"] },
        OR: [{ estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] } }, { domicilio: { estado: "EN_CAMINO" } }],
      },
      include: incluirDomicilio,
      orderBy: { creadoEn: "asc" },
    });
    res.json(pedidos);
  })
);

// Nombres usados en los últimos 60 días, para sugerirlos al despachar.
domiciliosRouter.get(
  "/domiciliarios",
  catchAsync(async (_req, res) => {
    const recientes = await prisma.domicilio.findMany({
      where: { domiciliario: { not: null }, salioEn: { gte: new Date(Date.now() - 60 * 86_400_000) } },
      select: { domiciliario: true },
      distinct: ["domiciliario"],
    });
    res.json(recientes.map((d) => d.domiciliario!).sort((a, b) => a.localeCompare(b, "es")));
  })
);

async function pedidoDeDomicilio(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { items: true, domicilio: true, factura: true } });
  if (!pedido || (pedido.canal !== "DOMICILIO" && pedido.canal !== "PLATAFORMA")) throw new ErrorDeNegocio("Pedido a domicilio no encontrado", 404);
  return pedido;
}

async function responder(res: Response, pedidoId: string) {
  const actualizado = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: incluirDomicilio });
  if (actualizado) {
    // A cocina, meseros y pantalla, sin la dirección ni la cuenta.
    const { domicilio: _d, factura: _f, ...pedido } = actualizado;
    emitPedidoActualizado(pedido);
  }
  res.json(actualizado);
}

// Salió del restaurante: con el mensajero propio (queda "en camino") o con el
// repartidor de la app (ahí termina para el negocio). Todo debe estar listo.
domiciliosRouter.put(
  "/:id/despachar",
  catchAsync(async (req, res) => {
    const domiciliario = typeof req.body?.domiciliario === "string" ? req.body.domiciliario.trim().slice(0, 60) || null : null;
    const pedido = await pedidoDeDomicilio(req.params.id);
    const enCurso = pedido.items.filter((i) => i.estado !== "ENTREGADO" && i.estado !== "CANCELADO");
    if (pedido.estado !== "LISTO" || enCurso.some((i) => i.estado !== "LISTO")) {
      throw new ErrorDeNegocio("Todavía hay productos en cocina: espera a que todo esté listo para despacharlo.", 409);
    }

    await prisma.$transaction(async (tx) => {
      const tomado = await tx.pedido.updateMany({ where: { id: pedido.id, estado: "LISTO" }, data: { estado: "ENTREGADO", entregadoEn: new Date() } });
      if (tomado.count === 0) throw new ErrorDeNegocio("Este pedido ya fue despachado", 409);
      await tx.pedidoItem.updateMany({ where: { id: { in: enCurso.map((i) => i.id) } }, data: { estado: "ENTREGADO" } });
      await tx.pedidoItemStatusLog.createMany({
        data: enCurso.map((i) => ({ pedidoItemId: i.id, deEstado: i.estado, aEstado: "ENTREGADO" as const, cambiadoPorId: req.user!.userId })),
      });
      await tx.pedidoStatusLog.create({ data: { pedidoId: pedido.id, deEstado: "LISTO", aEstado: "ENTREGADO", cambiadoPorId: req.user!.userId } });
      if (pedido.domicilio) {
        await tx.domicilio.update({ where: { id: pedido.domicilio.id }, data: { estado: "EN_CAMINO", salioEn: new Date(), domiciliario } });
      }
    });
    await responder(res, pedido.id);
  })
);

// El cliente lo recibió. Si pagaba al recibir, aquí se registra el cobro (lo
// que trae el mensajero entra a la caja).
domiciliosRouter.put(
  "/:id/entregado",
  catchAsync(async (req, res) => {
    const pedido = await pedidoDeDomicilio(req.params.id);
    if (!pedido.domicilio || pedido.domicilio.estado !== "EN_CAMINO") throw new ErrorDeNegocio("Este domicilio no está en camino", 409);
    const factura = pedido.factura;
    const pendiente = factura?.estado === "PENDIENTE";
    const cobro = cobroSchema.safeParse(req.body?.cobro);
    if (pendiente && !cobro.success) throw new ErrorDeNegocio("Registra cómo pagó el cliente al recibir", 400);
    const pagos = pendiente && cobro.success ? pagosDelCobro(cobro.data, factura!.total) : [];
    const adquiriente = adquirienteDelCobro(req.body?.cobro);
    if (adquiriente === "invalido") throw new ErrorDeNegocio(MENSAJE_ADQUIRIENTE, 400);

    await prisma.$transaction(async (tx) => {
      const tomado = await tx.domicilio.updateMany({ where: { id: pedido.domicilio!.id, estado: "EN_CAMINO" }, data: { estado: "ENTREGADO", entregadoEn: new Date() } });
      if (tomado.count === 0) throw new ErrorDeNegocio("Este domicilio ya fue cerrado", 409);
      if (pendiente) {
        const cobrada = await tx.factura.updateMany({
          where: { id: factura!.id, estado: "PENDIENTE" },
          data: {
            estado: "PAGADA",
            pagadaEn: new Date(),
            cerradaPorId: req.user!.userId,
            ...(adquiriente ? { adquiriente: adquiriente as unknown as Prisma.InputJsonValue } : {}),
          },
        });
        if (cobrada.count === 0) throw new ErrorDeNegocio("Esta cuenta ya fue resuelta", 409);
        const metodoPago = await registrarPagos(tx, factura!.id, pagos);
        await tx.factura.update({ where: { id: factura!.id }, data: { metodoPago } });
      }
    });
    if (pendiente) programarProcesamiento();
    await responder(res, pedido.id);
  })
);

// No se pudo entregar: si no había pagado, la cuenta queda como pérdida (con
// clave de supervisor, como en las mesas).
domiciliosRouter.put(
  "/:id/fallido",
  catchAsync(async (req, res) => {
    const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 200) : "";
    if (motivo.length < 3) throw new ErrorDeNegocio("Escribe qué pasó con la entrega", 400);
    const pedido = await pedidoDeDomicilio(req.params.id);
    if (!pedido.domicilio || pedido.domicilio.estado !== "EN_CAMINO") throw new ErrorDeNegocio("Este domicilio no está en camino", 409);
    const pin = typeof req.body?.pin === "string" ? req.body.pin : undefined;
    const pendiente = pedido.factura?.estado === "PENDIENTE";
    const autorizadaPorId = pendiente ? await exigirAutorizacion(req.user!, pin, "Registrar un domicilio que no se pudo cobrar") : null;

    await prisma.$transaction(async (tx) => {
      const tomado = await tx.domicilio.updateMany({
        where: { id: pedido.domicilio!.id, estado: "EN_CAMINO" },
        data: { estado: "FALLIDO", entregadoEn: new Date(), motivoFallido: motivo },
      });
      if (tomado.count === 0) throw new ErrorDeNegocio("Este domicilio ya fue cerrado", 409);
      if (pendiente) {
        await tx.factura.updateMany({
          where: { id: pedido.factura!.id, estado: "PENDIENTE" },
          data: { estado: "PERDIDA", pagadaEn: new Date(), cerradaPorId: req.user!.userId, autorizadaPorId },
        });
      }
    });
    if (autorizadaPorId) {
      await avisarAutorizacion(
        autorizadaPorId,
        `Domicilio de ${pedido.nombreCliente ?? "cliente"} no se pudo entregar (${motivo}): ${pedido.factura!.total.toLocaleString("es-CO")} quedó como pérdida.`
      );
    }
    await responder(res, pedido.id);
  })
);
