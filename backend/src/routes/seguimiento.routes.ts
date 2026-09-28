import { Router } from "express";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { crearLimitador } from "../lib/limitador";
import { nombreCorto } from "../lib/nombre";
import { estimarListoEn } from "../lib/tiempoEstimado";

export const seguimientoRouter = Router();

// Los códigos son aleatorios (72 bits), así que adivinarlos no es viable;
// esto solo frena a quien intente recorrerlos a la fuerza.
const limitadorPorIp = crearLimitador(600, 10 * 60_000);

type Etapa = "ESPERANDO_CONFIRMACION" | "VENCIDA" | "DESCARTADA" | "EN_COCINA" | "LISTO" | "ENTREGADO" | "CANCELADO";

// Público (sin login): lo abre el cliente desde el enlace que recibe al
// enviar su pedido por QR. Devuelve solo lo que él necesita ver; nada de
// teléfonos ni nombres del personal.
seguimientoRouter.get(
  "/:codigo",
  catchAsync(async (req, res) => {
    const ip = req.ip ?? "desconocida";
    if (limitadorPorIp.excedido(ip)) {
      res.status(429).json({ error: "Demasiadas consultas. Espera un momento." });
      return;
    }
    limitadorPorIp.registrar(ip);

    const solicitud = await prisma.solicitudPedido.findUnique({
      where: { codigoSeguimiento: req.params.codigo },
      include: {
        mesa: { select: { id: true, numero: true } },
        items: { include: { producto: { select: { nombre: true, tiempoPreparacionMinutos: true } } } },
        pedido: { include: { items: { include: { producto: { select: { nombre: true } }, adiciones: { select: { nombre: true } } } } } },
      },
    });
    if (!solicitud) {
      res.status(404).json({ error: "No encontramos ese pedido. Revisa el enlace." });
      return;
    }

    const pedido = solicitud.pedido;
    let etapa: Etapa;
    if (solicitud.estado === "PENDIENTE") etapa = "ESPERANDO_CONFIRMACION";
    // Sin quien la resolviera = la venció la limpieza automática.
    else if (solicitud.estado === "DESCARTADA") etapa = solicitud.resueltaPorId ? "DESCARTADA" : "VENCIDA";
    else if (!pedido) etapa = "ESPERANDO_CONFIRMACION";
    else if (pedido.estado === "RECIBIDO" || pedido.estado === "EN_PREPARACION") etapa = "EN_COCINA";
    else etapa = pedido.estado;

    const conExtras = (nombre: string, extras: string[]) => (extras.length > 0 ? `${nombre} + ${extras.join(", ")}` : nombre);
    // Antes de confirmar, la solicitud solo guarda los ids de las adiciones.
    const adicionIds = pedido ? [] : solicitud.items.flatMap((i) => i.adicionIds);
    const adiciones = adicionIds.length > 0 ? await prisma.adicion.findMany({ where: { id: { in: adicionIds } }, select: { id: true, nombre: true } }) : [];
    const nombreAdicion = new Map(adiciones.map((a) => [a.id, a.nombre]));
    const items = pedido
      ? pedido.items.map((i) => ({
          nombre: conExtras(i.producto.nombre, i.adiciones.map((a) => a.nombre)),
          cantidad: i.cantidad,
          estado: i.estado,
        }))
      : solicitud.items.map((i) => ({
          nombre: conExtras(i.producto.nombre, i.adicionIds.flatMap((id) => nombreAdicion.get(id) ?? [])),
          cantidad: i.cantidad,
          estado: "PENDIENTE",
        }));

    res.json({
      canal: solicitud.mesaId ? "MESA" : "MOSTRADOR",
      mesaId: solicitud.mesa?.id ?? null,
      mesaNumero: solicitud.mesa?.numero ?? null,
      nombre: nombreCorto(solicitud.nombreCliente),
      creadaEn: solicitud.creadaEn,
      etapa,
      items,
      // Antes de confirmar solo se puede dar una duración aproximada; ya en
      // cocina, una hora concreta.
      minutosPreparacion: Math.max(0, ...solicitud.items.map((i) => i.producto.tiempoPreparacionMinutos)),
      listoEstimadoEn: pedido ? estimarListoEn(pedido.creadoEn, pedido.items) : null,
    });
  })
);
