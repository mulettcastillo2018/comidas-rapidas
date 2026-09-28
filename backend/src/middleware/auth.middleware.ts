import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";
import { obtenerEstadoUsuario } from "../lib/estadoUsuario";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Motivo por el que un token válido ya no sirve, o null si sigue vigente. El
// token dura 7 días, así que además de su firma se revisa el estado actual del
// usuario: desactivarlo o cambiarle el rol debe surtir efecto de inmediato, no
// cuando el token expire.
export async function motivoTokenInvalido(payload: JwtPayload): Promise<string | null> {
  const estado = await obtenerEstadoUsuario(payload.userId);
  if (!estado || !estado.isActive) return "Tu cuenta está desactivada. Habla con el administrador.";
  if (estado.role !== payload.role) return "Tu rol cambió. Inicia sesión de nuevo.";
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  try {
    const motivo = await motivoTokenInvalido(payload);
    if (motivo) {
      res.status(401).json({ error: motivo });
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  req.user = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Requiere permisos de administrador" });
    return;
  }
  next();
}

export function requireMesero(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "MESERO" && req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Requiere permisos de mesero" });
    return;
  }
  next();
}

export function requireCocina(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "COCINA" && req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Requiere permisos de cocina" });
    return;
  }
  next();
}
