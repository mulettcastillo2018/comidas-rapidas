import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
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
