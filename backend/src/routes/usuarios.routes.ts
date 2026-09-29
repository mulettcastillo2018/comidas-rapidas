import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminGeneral } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { olvidarEstadoUsuario } from "../lib/estadoUsuario";
import { desconectarUsuario } from "../realtime/socket";
import { sedeActivaPorId } from "../services/sedes";

export const usuariosRouter = Router();

const vista = { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true, sedeId: true } as const;

// El administrador de una sede solo ve y maneja al personal de su sede; el
// general, a todos.
usuariosRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const usuarios = await prisma.user.findMany({
      where: req.sedeFija ? { sedeId: req.sedeId } : {},
      orderBy: { createdAt: "desc" },
      select: { ...vista, pinHash: true, sede: { select: { nombre: true } } },
    });
    // Solo si tiene clave de supervisor, nunca el hash.
    res.json(usuarios.map(({ pinHash, sede, ...u }) => ({ ...u, sede: sede?.nombre ?? null, tienePin: pinHash !== null })));
  })
);

async function usuarioAlAlcance(req: Request, id: string) {
  const usuario = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, sedeId: true } });
  if (!usuario) throw new ErrorDeNegocio("Usuario no encontrado", 404);
  if (req.sedeFija && usuario.sedeId !== req.sedeId) throw new ErrorDeNegocio("Esa persona es de otra sede", 403);
  return usuario;
}

const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, "La clave debe tener de 4 a 6 números").nullable() });

// Cada admin configura su propia clave de supervisor (nadie más la conoce).
// null la quita.
usuariosRouter.put(
  "/me/pin",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Clave inválida" });
      return;
    }
    const { pin } = parsed.data;
    // Cada autorización queda a nombre de quien digitó la clave: dos admins
    // no pueden tener la misma.
    if (pin) {
      const otros = await prisma.user.findMany({ where: { role: "ADMIN", id: { not: req.user!.userId }, pinHash: { not: null } }, select: { pinHash: true } });
      for (const otro of otros) {
        if (await bcrypt.compare(pin, otro.pinHash!)) {
          res.status(409).json({ error: "Esa clave no está disponible. Elige otra." });
          return;
        }
      }
    }
    await prisma.user.update({ where: { id: req.user!.userId }, data: { pinHash: pin ? await bcrypt.hash(pin, 10) : null } });
    res.json({ tienePin: pin !== null });
  })
);

// Sede de una cuenta: el administrador de una sede solo crea en la suya. Del
// general: la indicada; si no indica, la sede en la que está (un
// administrador sin sede es general).
async function sedeParaCuenta(req: Request, role: string, pedida: string | null | undefined): Promise<string | null> {
  if (req.sedeFija) {
    if (pedida && pedida !== req.sedeId) throw new ErrorDeNegocio("Solo puedes crear personal de tu sede", 403);
    return req.sedeId;
  }
  if (pedida === undefined) return role === "ADMIN" ? null : req.sedeId;
  if (pedida === null) {
    if (role !== "ADMIN") throw new ErrorDeNegocio("Elige la sede donde trabajará", 400);
    return null;
  }
  const sede = await sedeActivaPorId(pedida);
  if (!sede) throw new ErrorDeNegocio("Esa sede no existe o está inactiva", 400);
  return sede.id;
}

// No hay registro público: el Admin crea aquí las cuentas de Mesero/Cocina/Admin.
// Nombre y apellido van por separado (en vez de un solo "name" libre) para que
// la lista de usuarios muestre a personas reales (ej. "Katherine Díaz") y no
// se repita el rol dentro del propio nombre.
const createUserSchema = z.object({
  nombre: z.string().trim().min(1),
  apellido: z.string().trim().optional().default(""),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MESERO", "COCINA", "PANTALLA"]),
  // null = administrador general (sin sede).
  sedeId: z.string().min(1).nullable().optional(),
});

usuariosRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { nombre, apellido, email, password, role } = parsed.data;
    const sedeId = await sedeParaCuenta(req, role, parsed.data.sedeId);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Ya existe un usuario con ese correo" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { nombre, apellido, email, passwordHash, role, sedeId }, select: vista });
    res.status(201).json(user);
  })
);

const nombreSchema = z.object({ nombre: z.string().trim().min(1), apellido: z.string().trim().optional().default("") });

usuariosRouter.put(
  "/:id/nombre",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = nombreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await usuarioAlAlcance(req, req.params.id);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { nombre: parsed.data.nombre, apellido: parsed.data.apellido },
      select: vista,
    });
    res.json(user);
  })
);

const roleSchema = z.object({ role: z.enum(["ADMIN", "MESERO", "COCINA", "PANTALLA"]) });

usuariosRouter.put(
  "/:id/role",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const antes = await usuarioAlAlcance(req, req.params.id);
    // Un administrador general que deja de serlo pasa a la sede en la que se
    // está trabajando (solo el administrador puede no tener sede).
    const sedeId = parsed.data.role !== "ADMIN" && !antes.sedeId ? req.sedeId : antes.sedeId;
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role: parsed.data.role, sedeId }, select: vista });
    olvidarEstadoUsuario(user.id);
    desconectarUsuario(user.id);
    res.json(user);
  })
);

const sedeSchema = z.object({ sedeId: z.string().min(1).nullable() });

// Pasar a alguien a otra sede (o volver general a un administrador): solo el
// administrador general, y sin nada abierto en la sede de antes.
usuariosRouter.put(
  "/:id/sede",
  requireAuth,
  requireAdmin,
  requireAdminGeneral,
  catchAsync(async (req, res) => {
    const parsed = sedeSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Elige una sede", 400);
    const antes = await usuarioAlAlcance(req, req.params.id);
    const sedeId = await sedeParaCuenta(req, antes.role, parsed.data.sedeId);
    if (sedeId !== antes.sedeId) {
      const [mesasAbiertas, turnoAbierto] = await Promise.all([
        prisma.mesaSesion.count({ where: { meseroId: antes.id, estado: { not: "CERRADA" } } }),
        prisma.turno.count({ where: { userId: antes.id, salida: null } }),
      ]);
      if (mesasAbiertas > 0) throw new ErrorDeNegocio("Tiene mesas abiertas: ciérralas o pásalas a otro mesero primero", 409);
      if (turnoAbierto > 0) throw new ErrorDeNegocio("Tiene un turno abierto: que marque la salida primero", 409);
    }
    const user = await prisma.user.update({ where: { id: antes.id }, data: { sedeId }, select: vista });
    olvidarEstadoUsuario(user.id);
    // Sus pantallas se reconectan y quedan en las salas de la nueva sede.
    desconectarUsuario(user.id);
    res.json(user);
  })
);

const activeSchema = z.object({ isActive: z.boolean() });

usuariosRouter.put(
  "/:id/active",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await usuarioAlAlcance(req, req.params.id);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: parsed.data.isActive }, select: vista });
    olvidarEstadoUsuario(user.id);
    if (!user.isActive) desconectarUsuario(user.id);
    res.json(user);
  })
);

const passwordSchema = z.object({ newPassword: z.string().min(8) });

usuariosRouter.put(
  "/:id/password",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await usuarioAlAlcance(req, req.params.id);
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    res.status(204).send();
  })
);
