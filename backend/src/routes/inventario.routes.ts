import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { emitProductoActualizado } from "../realtime/socket";
import { revisarStock } from "../services/inventario";

export const inventarioRouter = Router();

// Inventario por unidades para lo que se vende tal cual se compra (bebidas,
// empacados): se registra lo que llega y cada venta lo descuenta sola.
inventarioRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const productos = await prisma.producto.findMany({
      where: { isActive: true },
      orderBy: [{ controlaStock: "desc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        requiereCocina: true,
        disponible: true,
        controlaStock: true,
        stock: true,
        stockMinimo: true,
        agotadoPorStock: true,
        categoria: { select: { nombre: true } },
      },
    });
    res.json(productos);
  })
);

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
    await prisma.$transaction(async (tx) => {
      const activado = await tx.producto.updateMany({
        where: { id: req.params.productoId, controlaStock: false },
        data: { controlaStock: true, stock: stockInicial, stockMinimo, alertaStockBajo: false },
      });
      if (activado.count === 0) throw new ErrorDeNegocio("Ese producto no existe o ya tiene inventario", 409);
      await tx.movimientoInventario.create({
        data: { productoId: req.params.productoId, tipo: "AJUSTE", cantidad: stockInicial, stockResultante: stockInicial, nota: "Conteo inicial", userId: req.user!.userId },
      });
    });
    await revisarStock([req.params.productoId]);
    res.json(await prisma.producto.findUnique({ where: { id: req.params.productoId } }));
  })
);

inventarioRouter.post(
  "/:productoId/desactivar",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const producto = await prisma.producto.findUnique({ where: { id: req.params.productoId } });
    if (!producto) throw new ErrorDeNegocio("Producto no encontrado", 404);
    // Si se había agotado por inventario, sin inventario vuelve a estar disponible.
    const actualizado = await prisma.producto.update({
      where: { id: producto.id },
      data: { controlaStock: false, alertaStockBajo: false, ...(producto.agotadoPorStock ? { disponible: true, agotadoPorStock: false } : {}) },
      include: { categoria: true },
    });
    if (producto.agotadoPorStock) emitProductoActualizado(actualizado);
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
    const producto = await prisma.producto.update({
      where: { id: req.params.productoId },
      data: { stockMinimo: parsed.data.stockMinimo, alertaStockBajo: false },
    });
    await revisarStock([producto.id]);
    res.json(producto);
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

    const movimiento = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findUnique({ where: { id: req.params.productoId } });
      if (!producto || !producto.controlaStock) throw new ErrorDeNegocio("Ese producto no tiene inventario activado", 409);
      // Una entrada suma sobre lo que haya (aunque justo se venda algo); un
      // ajuste deja exactamente lo contado.
      const actualizado =
        tipo === "ENTRADA"
          ? await tx.producto.update({ where: { id: producto.id }, data: { stock: { increment: cantidad } } })
          : await tx.producto.update({ where: { id: producto.id }, data: { stock: cantidad } });
      return tx.movimientoInventario.create({
        data: {
          productoId: producto.id,
          tipo,
          cantidad: tipo === "ENTRADA" ? cantidad : cantidad - producto.stock,
          stockResultante: actualizado.stock,
          nota: nota || null,
          userId: req.user!.userId,
        },
      });
    });
    await revisarStock([req.params.productoId]);
    res.status(201).json(movimiento);
  })
);

inventarioRouter.get(
  "/:productoId/movimientos",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const movimientos = await prisma.movimientoInventario.findMany({
      where: { productoId: req.params.productoId },
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: { user: { select: { nombre: true, apellido: true } } },
    });
    res.json(movimientos);
  })
);
