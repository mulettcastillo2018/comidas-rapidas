import { Router } from "express";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../lib/catchAsync";
import { OMITIR_PRODUCTO, paraClientes } from "../lib/datosInternos";
import { conPromociones, incluirCatalogo } from "../services/catalogo";
import { conEstadoEnSede } from "../services/disponibilidad";
import { sedeDeLaCarta } from "../services/sedes";

export const cartaRouter = Router();

// Endpoint público (sin auth): la carta que el cliente ve desde su celular al
// escanear el QR en la mesa. Solo categorías con al menos un producto activo
// y disponible en esa sede (la de la mesa, o la del QR de mostrador).
cartaRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const sedeId = await sedeDeLaCarta(req.query.mesa, req.query.sede);
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombre: "asc" },
      include: {
        productos: {
          where: { isActive: true },
          orderBy: { nombre: "asc" },
          omit: OMITIR_PRODUCTO,
          include: { adiciones: incluirCatalogo.adiciones, componentes: incluirCatalogo.componentes },
        },
      },
    });
    // Con la promoción vigente ya aplicada al precio que ve el cliente.
    const conPromo = await Promise.all(
      categorias.map(async (c) => ({
        ...c,
        productos: (await conEstadoEnSede(await conPromociones(c.productos), sedeId)).filter((p) => p.disponible).map(paraClientes),
      }))
    );
    res.json(conPromo.filter((c) => c.productos.length > 0));
  })
);
