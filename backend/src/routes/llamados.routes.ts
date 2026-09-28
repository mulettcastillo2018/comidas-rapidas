import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { crearLimitador } from "../lib/limitador";
import { emitLlamadoMesa } from "../realtime/socket";
import { enlaces, notificarPorRol, notificarUsuarios } from "../services/notificaciones";

export const llamadosRouter = Router();

// Una vez por minuto por mesa y tipo (si el cliente toca varias veces, el
// mesero no recibe una ráfaga de avisos) y un tope por dispositivo.
const porMesa = crearLimitador(1, 60_000);
const porIp = crearLimitador(20, 10 * 60_000);

const llamadoSchema = z.object({ mesaId: z.string().min(1), tipo: z.enum(["MESERO", "CUENTA"]) });

// Público (sin login): desde el QR de su mesa el cliente llama al mesero o
// pide la cuenta, sin tener que levantar la mano.
llamadosRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = llamadoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Llamado inválido" });
      return;
    }
    const { mesaId, tipo } = parsed.data;
    const ip = req.ip ?? "desconocida";
    if (porIp.excedido(ip)) throw new ErrorDeNegocio("Demasiados llamados seguidos. Espera un momento.", 429);
    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!mesa || !mesa.activa) throw new ErrorDeNegocio("Este código QR ya no corresponde a una mesa en servicio.", 404);
    const clave = `${mesaId}:${tipo}`;
    if (porMesa.excedido(clave)) throw new ErrorDeNegocio("Ya le avisamos a tu mesero hace un momento. Ya viene.", 429);
    porMesa.registrar(clave);
    porIp.registrar(ip);

    const mensaje = tipo === "CUENTA" ? `Mesa ${mesa.numero} pide la cuenta` : `Mesa ${mesa.numero} te está llamando`;
    // Si la mesa está abierta, al mesero que la atiende; si no, al asignado
    // o a todos los meseros.
    const sesion = await prisma.mesaSesion.findFirst({ where: { mesaId, estado: { not: "CERRADA" } } });
    if (sesion) {
      await notificarUsuarios({ userIds: [sesion.meseroId], tipo: "LLAMADO_MESA", mensaje, enlace: enlaces.mesaAbierta(sesion.id) });
    } else if (mesa.meseroAsignadoId) {
      await notificarUsuarios({ userIds: [mesa.meseroAsignadoId], tipo: "LLAMADO_MESA", mensaje, enlace: enlaces.grillaMesas(mesaId) });
    } else {
      await notificarPorRol({ rol: "MESERO", tipo: "LLAMADO_MESA", mensaje, enlace: enlaces.grillaMesas(mesaId) });
    }
    emitLlamadoMesa({ mesaId, tipo });
    res.status(201).json({ ok: true });
  })
);
