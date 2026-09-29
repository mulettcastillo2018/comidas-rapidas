import { Router, type Request } from "express";
import { exigirMismaSede } from "../services/sedes";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { cobroSchema, pagosDelCobro, registrarPagos, type Cobro } from "../services/pagos";
import { avisarAutorizacion, exigirAutorizacion } from "../services/autorizacion";
import { enlaces } from "../services/notificaciones";
import { nombreCompleto } from "../lib/nombre";
import { requireAuth, requireMesero } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { emitMesaSesionCerrada } from "../realtime/socket";
import type { Prisma } from "@prisma/client";
import { adquirienteDelCobro, MENSAJE_ADQUIRIENTE } from "../services/facturacion/adquiriente";
import { programarProcesamiento } from "../services/facturacion/servicio";
import type { Adquiriente } from "../services/facturacion/documento";
import { acumularPuntos, asignarCliente, canjearPuntos, clienteDelCobro, devolverCanje } from "../services/fidelizacion";

export const facturasRouter = Router();

const generarFacturaSchema = z.object({
  mesaSesionId: z.string().min(1),
  propinaMonto: z.number().int().min(0).optional(),
  // Descuento a toda la cuenta; 100% = cortesía. Siempre con motivo.
  descuento: z
    .object({
      tipo: z.enum(["PORCENTAJE", "VALOR"]),
      valor: z.number().int().positive(),
      motivo: z.string().trim().min(3).max(200),
    })
    .optional(),
  pin: z.string().optional(),
  // Cliente frecuente: acumula puntos al pagar y puede canjear.
  cliente: z.object({ clienteId: z.string().min(1), canjearPuntos: z.number().int().positive().optional() }).optional(),
});

facturasRouter.post(
  "/",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = generarFacturaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisa la cuenta: el descuento necesita un valor y un motivo (mínimo 3 letras)" });
      return;
    }
    const { mesaSesionId, propinaMonto = 0, descuento, cliente } = parsed.data;
    if (cliente && !(await prisma.cliente.findFirst({ where: { id: cliente.clienteId, eliminadoEn: null } }))) throw new ErrorDeNegocio("Cliente no encontrado", 404);
    if (descuento?.tipo === "PORCENTAJE" && descuento.valor > 100) throw new ErrorDeNegocio("El descuento no puede pasar del 100%", 400);

    const sesion = await prisma.mesaSesion.findUnique({ where: { id: mesaSesionId }, include: { mesa: { select: { sedeId: true, numero: true } } } });
    if (!sesion) {
      res.status(404).json({ error: "Sesión de mesa no encontrada" });
      return;
    }
    exigirMismaSede(req, sesion.mesa.sedeId, "Esa mesa");
    if (sesion.meseroId !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Esta mesa la está atendiendo otro mesero" });
      return;
    }
    const sedeId = sesion.mesa.sedeId;
    // Un descuento o cortesía lo autoriza un admin con su clave.
    const autorizadoPorId = descuento ? await exigirAutorizacion(req.user!, parsed.data.pin, "Aplicar un descuento o una cortesía", sedeId) : null;

    const factura = await prisma.$transaction(async (tx) => {
      // Pasar la mesa a "cuenta solicitada" solo si sigue abierta, en una
      // sola operación: si llegan dos solicitudes de cuenta a la vez, solo
      // la primera pasa (antes la segunda terminaba en un error 500).
      const tomada = await tx.mesaSesion.updateMany({
        where: { id: mesaSesionId, estado: "ABIERTA" },
        data: { estado: "CUENTA_SOLICITADA" },
      });
      if (tomada.count === 0) throw new ErrorDeNegocio("Esta mesa ya tiene la cuenta generada o ya fue cerrada", 409);

      const items = await tx.pedidoItem.findMany({ where: { pedido: { mesaSesionId } }, include: { producto: true } });

      // No se cobra mientras haya algo sin entregar: si no, la mesa se libera
      // y cocina se queda con pedidos de clientes que ya se fueron. Como
      // entregados y cancelados son estados finales, esto también garantiza
      // que la cuenta ya no pueda cambiar después de generada.
      const pendientes = items.filter((i) => i.estado !== "ENTREGADO" && i.estado !== "CANCELADO");
      if (pendientes.length > 0) {
        const detalle = pendientes.map((i) => `${i.cantidad}× ${i.producto.nombre}`).join(", ");
        throw new ErrorDeNegocio(
          `No se puede generar la cuenta: hay ${pendientes.length} producto(s) sin entregar (${detalle}). Entrégalos o cancélalos primero.`,
          409
        );
      }

      // Por ítem, no por pedido: un pedido puede tener una cancelación parcial
      // sin quedar CANCELADO completo, y esos productos no se cobran.
      const cobrables = items.filter((i) => i.estado !== "CANCELADO");
      if (cobrables.length === 0) throw new ErrorDeNegocio("No hay pedidos para facturar en esta mesa", 400);
      const subtotal = cobrables.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0);
      const descuentoMonto = !descuento
        ? 0
        : descuento.tipo === "PORCENTAJE"
          ? Math.round((subtotal * descuento.valor) / 100)
          : Math.min(descuento.valor, subtotal);

      const creada = await tx.factura.create({
        data: {
          sedeId,
          mesaSesionId,
          subtotal,
          descuentoMonto,
          descuentoMotivo: descuento?.motivo ?? null,
          descuentoAutorizadoPorId: autorizadoPorId,
          propinaMonto,
          total: subtotal - descuentoMonto + propinaMonto,
          clienteId: cliente?.clienteId ?? null,
        },
      });
      if (!cliente?.canjearPuntos) return creada;
      // El canje es un descuento más; no pide clave (el cliente se ganó los puntos).
      const canje = await canjearPuntos(tx, cliente.clienteId, cliente.canjearPuntos, subtotal - descuentoMonto, creada.id, req.user!.userId);
      const motivoCanje = `Canje de ${cliente.canjearPuntos} puntos`;
      return tx.factura.update({
        where: { id: creada.id },
        data: {
          descuentoMonto: descuentoMonto + canje,
          descuentoMotivo: descuento ? `${descuento.motivo} + ${motivoCanje.toLowerCase()}` : motivoCanje,
          total: subtotal - descuentoMonto - canje + propinaMonto,
          puntosCanjeados: cliente.canjearPuntos,
        },
      });
    });

    if (descuento && autorizadoPorId && req.user!.role !== "ADMIN") {
      await avisarAutorizacion(
        autorizadoPorId,
        `Descuento de ${factura.descuentoMonto.toLocaleString("es-CO")} en la Mesa ${sesion.mesa.numero} (${descuento.motivo}).`,
        sedeId,
        enlaces.mesaAbierta(sesion.id)
      );
    }
    res.status(201).json(factura);
  })
);

// Cierra la cuenta de una mesa (pagada, o perdida si el cliente se fue sin
// pagar) y libera la mesa. Solo procede si la cuenta sigue pendiente, en la
// misma operación que la actualiza, para que "pagar" y "se fue sin pagar"
// no puedan aplicarse los dos a la vez sobre la misma cuenta.
async function resolverCuentaDeMesa(
  req: Request,
  facturaId: string,
  usuario: { userId: string; role: string },
  resultado: { estado: "PAGADA"; cobro: Cobro; adquiriente?: Adquiriente; clienteId?: string } | { estado: "PERDIDA"; autorizadaPorId: string }
) {
  const factura = await prisma.factura.findUnique({ where: { id: facturaId }, include: { mesaSesion: true } });
  if (!factura) throw new ErrorDeNegocio("Factura no encontrada", 404);
  exigirMismaSede(req, factura.sedeId, "Esa cuenta");
  const sesion = factura.mesaSesion;
  if (!sesion) throw new ErrorDeNegocio("Esta factura es de un pedido de mostrador, no de una mesa", 400);
  if (sesion.meseroId !== usuario.userId && usuario.role !== "ADMIN") {
    throw new ErrorDeNegocio("Esta mesa la está atendiendo otro mesero", 403);
  }
  const pagos = resultado.estado === "PAGADA" ? pagosDelCobro(resultado.cobro, factura.total) : [];

  await prisma.$transaction(async (tx) => {
    const resuelta = await tx.factura.updateMany({
      where: { id: factura.id, estado: "PENDIENTE" },
      data: {
        estado: resultado.estado,
        pagadaEn: new Date(),
        cerradaPorId: usuario.userId,
        ...(resultado.estado === "PERDIDA" ? { autorizadaPorId: resultado.autorizadaPorId } : {}),
        ...(resultado.estado === "PAGADA" && resultado.adquiriente ? { adquiriente: resultado.adquiriente as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    if (resuelta.count === 0) throw new ErrorDeNegocio("Esta cuenta ya fue resuelta", 409);
    if (pagos.length > 0) {
      const metodoPago = await registrarPagos(tx, factura.id, pagos);
      await tx.factura.update({ where: { id: factura.id }, data: { metodoPago } });
    }
    if (resultado.estado === "PAGADA") await asignarCliente(tx, factura.id, resultado.clienteId);
    await tx.mesaSesion.update({ where: { id: sesion.id }, data: { estado: "CERRADA", cerradaEn: new Date() } });
    await tx.mesa.update({ where: { id: sesion.mesaId }, data: { estado: "LIBRE" } });
  });

  emitMesaSesionCerrada({ mesaId: sesion.mesaId, sesionId: sesion.id, sedeId: factura.sedeId });
  if (resultado.estado === "PAGADA") {
    await acumularPuntos(factura.id);
    programarProcesamiento();
  } else {
    // Los puntos canjeados en una cuenta que no se pagó vuelven al cliente.
    await devolverCanje(factura.id);
  }
  return prisma.factura.findUnique({ where: { id: factura.id } });
}

facturasRouter.put(
  "/:id/pagar",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const parsed = cobroSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica cómo se pagó: un método, o la lista de pagos con su método y monto" });
      return;
    }
    // Si el cliente pide la factura electrónica a su nombre.
    const adquiriente = adquirienteDelCobro(req.body);
    if (adquiriente === "invalido") throw new ErrorDeNegocio(MENSAJE_ADQUIRIENTE, 400);
    const factura = await resolverCuentaDeMesa(req, req.params.id, req.user!, { estado: "PAGADA", cobro: parsed.data, adquiriente, clienteId: clienteDelCobro(req.body) });
    res.json(factura);
  })
);

// Cliente se fue sin pagar (o se decide no cobrar): deja constancia de la
// pérdida en vez de forzar a marcarla "pagada" (que sería falso) o dejar la
// mesa atascada para siempre esperando un pago que no va a llegar.
// Un mesero no puede hacerlo solo: si cobró en efectivo podría quedarse la
// plata y registrarlo como pérdida. Necesita la clave de un admin.
facturasRouter.put(
  "/:id/marcar-perdida",
  requireAuth,
  requireMesero,
  catchAsync(async (req, res) => {
    const pin = typeof req.body?.pin === "string" ? req.body.pin : undefined;
    // La clave se revisa contra los admins de la sede de la cuenta.
    const sedeId = (await prisma.factura.findUnique({ where: { id: req.params.id }, select: { sedeId: true } }))?.sedeId ?? req.sedeId;
    const autorizadaPorId = await exigirAutorizacion(req.user!, pin, "Registrar que el cliente se fue sin pagar", sedeId);
    const factura = await resolverCuentaDeMesa(req, req.params.id, req.user!, { estado: "PERDIDA", autorizadaPorId });

    const detalle = await prisma.factura.findUnique({
      where: { id: req.params.id },
      include: {
        mesaSesion: { include: { mesa: true } },
        cerradaPor: { select: { nombre: true, apellido: true } },
        autorizadaPor: { select: { nombre: true, apellido: true } },
      },
    });
    if (detalle?.mesaSesion) {
      await avisarAutorizacion(
        autorizadaPorId,
        `${nombreCompleto(detalle.cerradaPor)} registró la Mesa ${detalle.mesaSesion.mesa.numero} como "se fue sin pagar" (${detalle.total.toLocaleString("es-CO")}). Autorizó: ${nombreCompleto(detalle.autorizadaPor)}.`,
        detalle.sedeId,
        enlaces.mesaAbierta(detalle.mesaSesion.id)
      );
    }
    res.json(factura);
  })
);
