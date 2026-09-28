import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { nombreCompleto } from "../lib/nombre";
import { esDiaValido, rangoDeDias } from "../lib/fechas";
import { horasEnRango } from "../services/propinas";

export const turnosRouter = Router();
turnosRouter.use(requireAuth);

// Un turno más largo que esto casi seguro es una salida que no se marcó.
const MAX_HORAS_TURNO = 16;

function puedeMarcar(role: string) {
  if (role === "PANTALLA") throw new ErrorDeNegocio("Una pantalla no marca turnos", 403);
}

turnosRouter.get(
  "/mio",
  catchAsync(async (req, res) => {
    const abierto = await prisma.turno.findFirst({ where: { userId: req.user!.userId, salida: null }, orderBy: { entrada: "desc" } });
    res.json({ abierto });
  })
);

turnosRouter.post(
  "/entrada",
  catchAsync(async (req, res) => {
    puedeMarcar(req.user!.role);
    // Dentro de una transacción serializada por usuario: dos toques seguidos
    // no abren dos turnos.
    const turno = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${req.user!.userId} FOR UPDATE`;
      const abierto = await tx.turno.findFirst({ where: { userId: req.user!.userId, salida: null } });
      if (abierto) throw new ErrorDeNegocio("Ya tienes un turno abierto", 409);
      return tx.turno.create({ data: { userId: req.user!.userId } });
    });
    res.status(201).json(turno);
  })
);

turnosRouter.post(
  "/salida",
  catchAsync(async (req, res) => {
    puedeMarcar(req.user!.role);
    const abierto = await prisma.turno.findFirst({ where: { userId: req.user!.userId, salida: null }, orderBy: { entrada: "desc" } });
    if (!abierto) throw new ErrorDeNegocio("No tienes un turno abierto", 409);
    const cerrado = await prisma.turno.updateMany({ where: { id: abierto.id, salida: null }, data: { salida: new Date() } });
    if (cerrado.count === 0) throw new ErrorDeNegocio("Este turno ya se cerró", 409);
    res.json(await prisma.turno.findUnique({ where: { id: abierto.id } }));
  })
);

const rangoSchema = z.object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) });

// Turnos que tocan el rango (una noche que cruza la medianoche cuenta en
// ambos días, cada parte en el suyo).
turnosRouter.get(
  "/",
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = rangoSchema.safeParse(req.query);
    if (!parsed.success) throw new ErrorDeNegocio("Indica un rango de fechas válido (desde y hasta, formato AAAA-MM-DD)", 400);
    const { inicio, fin } = rangoDeDias(parsed.data.desde, parsed.data.hasta);
    const turnos = await prisma.turno.findMany({
      where: { entrada: { lt: fin }, OR: [{ salida: null }, { salida: { gt: inicio } }] },
      include: { user: { select: { id: true, nombre: true, apellido: true, role: true } } },
      orderBy: { entrada: "desc" },
    });
    const ahora = new Date();
    const filas = turnos.map((t) => ({
      id: t.id,
      userId: t.userId,
      nombre: nombreCompleto(t.user),
      role: t.user.role,
      entrada: t.entrada,
      salida: t.salida,
      horas: horasEnRango(t.entrada, t.salida ?? ahora, inicio, fin),
      editado: Boolean(t.editadoPorId),
    }));
    const porPersona = new Map<string, { userId: string; nombre: string; role: string; horas: number; turnos: number }>();
    for (const f of filas) {
      const p = porPersona.get(f.userId) ?? { userId: f.userId, nombre: f.nombre, role: f.role, horas: 0, turnos: 0 };
      p.horas = Math.round((p.horas + f.horas) * 100) / 100;
      p.turnos++;
      porPersona.set(f.userId, p);
    }
    res.json({ turnos: filas, porPersona: Array.from(porPersona.values()).sort((a, b) => b.horas - a.horas) });
  })
);

const correccionSchema = z.object({ entrada: z.string().datetime(), salida: z.string().datetime().nullable() });

// El admin corrige un turno (se le olvidó marcar la salida, marcó tarde...).
turnosRouter.put(
  "/:id",
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = correccionSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Indica la hora de entrada y la de salida", 400);
    const entrada = new Date(parsed.data.entrada);
    const salida = parsed.data.salida ? new Date(parsed.data.salida) : null;
    if (entrada > new Date()) throw new ErrorDeNegocio("La entrada no puede ser en el futuro", 400);
    if (salida && salida <= entrada) throw new ErrorDeNegocio("La salida debe ser después de la entrada", 400);
    if (salida && (salida.getTime() - entrada.getTime()) / 3_600_000 > MAX_HORAS_TURNO) {
      throw new ErrorDeNegocio(`Un turno no puede pasar de ${MAX_HORAS_TURNO} horas`, 400);
    }
    const turno = await prisma.turno.findUnique({ where: { id: req.params.id } });
    if (!turno) throw new ErrorDeNegocio("Turno no encontrado", 404);
    // No puede quedar montado sobre otro turno de la misma persona.
    const cruce = await prisma.turno.findFirst({
      where: { id: { not: turno.id }, userId: turno.userId, entrada: { lt: salida ?? new Date(8.64e15) }, OR: [{ salida: null }, { salida: { gt: entrada } }] },
    });
    if (cruce) throw new ErrorDeNegocio("Se cruza con otro turno de la misma persona", 409);
    res.json(await prisma.turno.update({ where: { id: turno.id }, data: { entrada, salida, editadoPorId: req.user!.userId } }));
  })
);
