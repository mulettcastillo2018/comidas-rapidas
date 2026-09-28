import { Router } from "express";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { OMITIR_PRODUCTO_PUBLICO } from "../lib/datosInternos";
import { conPromociones, incluirCatalogo } from "../services/catalogo";

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
          omit: OMITIR_PRODUCTO_PUBLICO,
          include: { adiciones: incluirCatalogo.adiciones, componentes: incluirCatalogo.componentes },
        },
      },
    });
    // Con la promoción vigente ya aplicada al precio que ve el cliente.
    const conPromo = await Promise.all(categorias.map(async (c) => ({ ...c, productos: await conPromociones(c.productos) })));
    res.json(conPromo.filter((c) => c.productos.length > 0));
  })
);
