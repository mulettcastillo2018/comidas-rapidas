import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { crearLimitador } from "../lib/limitador";
import { notificarPorRol } from "../services/notificaciones";

export const encuestasRouter = Router();

const porIp = crearLimitador(30, 10 * 60_000);

// El código viene del QR de la precuenta (el de la mesa) o de la página de
// seguimiento de un pedido de mostrador (el código de seguimiento).
async function buscarPorCodigo(codigo: string) {
  const sesion = await prisma.mesaSesion.findUnique({ where: { codigoEncuesta: codigo }, include: { mesa: true, encuesta: true } });
  if (sesion) {
    return { contexto: `Mesa ${sesion.mesa.numero}`, meseroId: sesion.meseroId, yaRespondida: Boolean(sesion.encuesta), destino: { mesaSesionId: sesion.id } };
  }
  const solicitud = await prisma.solicitudPedido.findUnique({
    where: { codigoSeguimiento: codigo },
    include: { encuesta: true, mesa: true, pedido: { select: { meseroId: true } } },
  });
  if (solicitud) {
    return {
      contexto: solicitud.mesa ? `Mesa ${solicitud.mesa.numero}` : "Pedido para recoger",
      meseroId: solicitud.pedido?.meseroId ?? null,
      yaRespondida: Boolean(solicitud.encuesta),
      destino: { solicitudId: solicitud.id },
    };
  }
  throw new ErrorDeNegocio("No encontramos esta encuesta. Revisa el enlace.", 404);
}

// Público (sin login).
encuestasRouter.get(
  "/:codigo",
  catchAsync(async (req, res) => {
    const { contexto, yaRespondida } = await buscarPorCodigo(req.params.codigo);
    res.json({ contexto, yaRespondida });
  })
);

const respuestaSchema = z.object({
  calificacion: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(500).optional(),
});

encuestasRouter.post(
  "/:codigo",
  catchAsync(async (req, res) => {
    const ip = req.ip ?? "desconocida";
    if (porIp.excedido(ip)) throw new ErrorDeNegocio("Demasiados envíos seguidos. Espera un momento.", 429);
    const parsed = respuestaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Elige de 1 a 5 estrellas" });
      return;
    }
    const encuesta = await buscarPorCodigo(req.params.codigo);
    // Una opinión por visita: la base también lo garantiza (código único).
    if (encuesta.yaRespondida) throw new ErrorDeNegocio("Ya recibimos tu opinión. ¡Gracias!", 409);
    porIp.registrar(ip);
    const { calificacion, comentario } = parsed.data;
    await prisma.encuesta.create({
      data: { ...encuesta.destino, meseroId: encuesta.meseroId, calificacion, comentario: comentario || null },
    });
    // Una mala calificación conviene verla el mismo día, no en el reporte.
    if (calificacion <= 2) {
      await notificarPorRol({
        rol: "ADMIN",
        tipo: "OPINION",
        mensaje: `${encuesta.contexto} calificó con ${calificacion}★${comentario ? `: "${comentario.slice(0, 120)}"` : ""}`,
        enlace: "/admin/reportes",
      });
    }
    res.status(201).json({ ok: true });
  })
);
