import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const usuariosRouter = Router();

usuariosRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const usuarios = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
    });
    res.json(usuarios);
  })
);

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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Ya existe un usuario con ese correo" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { nombre, apellido, email, passwordHash, role },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
    });
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { nombre: parsed.data.nombre, apellido: parsed.data.apellido },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
    });
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
    });
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
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    res.status(204).send();
  })
);
