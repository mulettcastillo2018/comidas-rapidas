import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";

// Apps de domicilios (Rappi, DiDi Food...) y la comisión de cada una.
export const plataformasRouter = Router();
plataformasRouter.use(requireAuth, requireAdmin);

const datosSchema = z.object({
  nombre: z.string().trim().min(2).max(40),
  comisionPct: z.number().min(0).max(60),
  activa: z.boolean().optional(),
});

function errorDeGuardado(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ErrorDeNegocio("Ya hay una app con ese nombre", 409);
  throw err;
}

plataformasRouter.get(
  "/",
  catchAsync(async (_req, res) => {
    res.json(await prisma.plataforma.findMany({ orderBy: { nombre: "asc" } }));
  })
);

plataformasRouter.post(
  "/",
  catchAsync(async (req, res) => {
    const parsed = datosSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Escribe el nombre de la app y su comisión (entre 0 y 60%)", 400);
    const plataforma = await prisma.plataforma.create({ data: parsed.data }).catch(errorDeGuardado);
    res.status(201).json(plataforma);
  })
);

plataformasRouter.put(
  "/:id",
  catchAsync(async (req, res) => {
    const parsed = datosSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Revisa los datos: la comisión va entre 0 y 60%", 400);
    const existe = await prisma.plataforma.findUnique({ where: { id: req.params.id } });
    if (!existe) throw new ErrorDeNegocio("App no encontrada", 404);
    // La comisión nueva aplica a los pedidos que lleguen de aquí en adelante;
    // la de los anteriores quedó guardada en su cuenta.
    const plataforma = await prisma.plataforma.update({ where: { id: existe.id }, data: parsed.data }).catch(errorDeGuardado);
    res.json(plataforma);
  })
);
