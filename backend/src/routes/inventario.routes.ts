import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { emitProductoActualizado } from "../realtime/socket";
import { revisarStock } from "../services/inventario";
import { actualizarEnSede, conEstadoEnSede, estadoEnSede } from "../services/disponibilidad";

export const inventarioRouter = Router();

// Inventario por unidades para lo que se vende tal cual se compra (bebidas,
// empacados): se registra lo que llega y cada venta lo descuenta sola. Cada
// sede lleva el suyo.
inventarioRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const productos = await prisma.producto.findMany({
      where: { isActive: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, requiereCocina: true, categoria: { select: { nombre: true } } },
    });
    const conEstado = await conEstadoEnSede(productos, req.sedeId);
    // Primero los que llevan inventario.
    res.json(conEstado.sort((a, b) => Number(b.controlaStock) - Number(a.controlaStock)));
  })
);

async function vista(productoId: string, sedeId: string) {
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId }, include: { categoria: true } });
  return { ...producto, ...(await estadoEnSede(productoId, sedeId)) };
}

const activarSchema = z.object({ stockInicial: z.number().int().min(0), stockMinimo: z.number().int().min(0) });

// Para empezar a controlarlo hace falta contar lo que hay: sin ese conteo,
// arrancaría en cero y se agotaría solo al instante.
inventarioRouter.post(
  "/:productoId/activar",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = activarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica cuántas unidades hay ahora y el mínimo para avisarte (números enteros)" });
      return;
    }
    const { stockInicial, stockMinimo } = parsed.data;
    const { productoId } = req.params;
    if (!(await prisma.producto.findUnique({ where: { id: productoId } }))) throw new ErrorDeNegocio("Ese producto no existe", 404);
    await prisma.$transaction(async (tx) => {
      const actual = await tx.productoSede.findUnique({ where: { productoId_sedeId: { productoId, sedeId: req.sedeId } } });
      if (actual?.controlaStock) throw new ErrorDeNegocio("Ese producto ya tiene inventario en esta sede", 409);
      await actualizarEnSede(tx, productoId, req.sedeId, { controlaStock: true, stock: stockInicial, stockMinimo, alertaStockBajo: false });
      await tx.movimientoInventario.create({
        data: { productoId, sedeId: req.sedeId, tipo: "AJUSTE", cantidad: stockInicial, stockResultante: stockInicial, nota: "Conteo inicial", userId: req.user!.userId },
      });
    });
    await revisarStock([productoId], req.sedeId);
    res.json(await vista(productoId, req.sedeId));
  })
);

inventarioRouter.post(
  "/:productoId/desactivar",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const { productoId } = req.params;
    const estado = await estadoEnSede(productoId, req.sedeId);
    // Si se había agotado por inventario, sin inventario vuelve a estar disponible.
    await actualizarEnSede(prisma, productoId, req.sedeId, {
      controlaStock: false,
      alertaStockBajo: false,
      ...(estado.agotadoPorStock ? { disponible: true, agotadoPorStock: false } : {}),
    });
    const actualizado = await vista(productoId, req.sedeId);
    if (estado.agotadoPorStock) emitProductoActualizado(actualizado, req.sedeId);
    res.json(actualizado);
  })
);

inventarioRouter.put(
  "/:productoId/minimo",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = z.object({ stockMinimo: z.number().int().min(0) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "El mínimo debe ser un número entero" });
      return;
    }
    await actualizarEnSede(prisma, req.params.productoId, req.sedeId, { stockMinimo: parsed.data.stockMinimo, alertaStockBajo: false });
    await revisarStock([req.params.productoId], req.sedeId);
    res.json(await vista(req.params.productoId, req.sedeId));
  })
);

const movimientoSchema = z.object({
  // ENTRADA: llegó mercancía (cantidad = unidades recibidas).
  // AJUSTE: se contó físicamente (cantidad = unidades que hay de verdad).
  tipo: z.enum(["ENTRADA", "AJUSTE"]),
  cantidad: z.number().int().min(0),
  nota: z.string().trim().max(200).optional(),
});

inventarioRouter.post(
  "/:productoId/movimientos",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = movimientoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica el tipo (entrada o ajuste) y la cantidad en unidades" });
      return;
    }
    const { tipo, cantidad, nota } = parsed.data;
    if (tipo === "ENTRADA" && cantidad === 0) throw new ErrorDeNegocio("La entrada debe ser de al menos una unidad", 400);
    const { productoId } = req.params;
    const clave = { productoId_sedeId: { productoId, sedeId: req.sedeId } };

    const movimiento = await prisma.$transaction(async (tx) => {
      const actual = await tx.productoSede.findUnique({ where: clave });
      if (!actual?.controlaStock) throw new ErrorDeNegocio("Ese producto no tiene inventario activado en esta sede", 409);
      // Una entrada suma sobre lo que haya (aunque justo se venda algo); un
      // ajuste deja exactamente lo contado.
      const actualizado =
        tipo === "ENTRADA"
          ? await tx.productoSede.update({ where: clave, data: { stock: { increment: cantidad } } })
          : await tx.productoSede.update({ where: clave, data: { stock: cantidad } });
      return tx.movimientoInventario.create({
        data: {
          productoId,
          sedeId: req.sedeId,
          tipo,
          cantidad: tipo === "ENTRADA" ? cantidad : cantidad - actual.stock,
          stockResultante: actualizado.stock,
          nota: nota || null,
          userId: req.user!.userId,
        },
      });
    });
    await revisarStock([productoId], req.sedeId);
    res.status(201).json(movimiento);
  })
);

inventarioRouter.get(
  "/:productoId/movimientos",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const movimientos = await prisma.movimientoInventario.findMany({
      where: { productoId: req.params.productoId, sedeId: req.sedeId },
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: { user: { select: { nombre: true, apellido: true } } },
    });
    res.json(movimientos);
  })
);
