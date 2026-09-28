import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// No hay registro público: los usuarios (Admin/Mesero/Cocina) los crea el Admin
// desde /admin/usuarios.
authRouter.post(
  "/login",
  catchAsync(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, apellido: user.apellido, email: user.email, role: user.role },
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, nombre: true, apellido: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json(user);
  })
);
