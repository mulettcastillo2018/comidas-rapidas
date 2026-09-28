import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { crearLimitador } from "../lib/limitador";

export const authRouter = Router();

// Frena el adivinar contraseñas: se cuentan solo los intentos fallidos por
// correo (no por IP, porque todo el personal comparte el wifi del local).
const intentosFallidos = crearLimitador(8, 15 * 60_000);

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
    const clave = email.toLowerCase();

    if (intentosFallidos.excedido(clave)) {
      res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos o pide al administrador que restablezca tu contraseña." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      intentosFallidos.registrar(clave);
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Tu cuenta está desactivada. Habla con el administrador." });
      return;
    }
    intentosFallidos.reiniciar(clave);

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
