import { Router } from "express";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { OMITIR_PRODUCTO } from "../lib/datosInternos";

export const cartaRouter = Router();

// Endpoint público (sin auth): la carta que el cliente ve desde su celular al
// escanear el QR en la mesa. Solo categorías con al menos un producto activo
// y disponible.
cartaRouter.get(
  "/",
  catchAsync(async (_req, res) => {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombre: "asc" },
      include: {
        productos: {
          where: { isActive: true, disponible: true },
          orderBy: { nombre: "asc" },
          omit: OMITIR_PRODUCTO,
        },
      },
    });
    res.json(categorias.filter((c) => c.productos.length > 0));
  })
);
