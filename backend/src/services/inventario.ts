import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";
import { emitProductoActualizado } from "../realtime/socket";
import { notificarPorRol } from "./notificaciones";

interface Linea {
  productoId: string;
  cantidad: number;
  pedidoItemId?: string;
}

const ENLACE_INVENTARIO = "/admin/inventario";

function agrupar(lineas: Linea[]) {
  const total = new Map<string, number>();
  for (const l of lineas) total.set(l.productoId, (total.get(l.productoId) ?? 0) + l.cantidad);
  return total;
}

// Descuenta lo vendido de los productos con inventario, dentro de la misma
// transacción que crea el pedido. El descuento es condicional ("solo si hay
// suficiente"): si dos pedidos piden la última gaseosa a la vez, uno pasa y
// el otro recibe "solo quedan 0".
export async function descontarStock(tx: Prisma.TransactionClient, lineas: Linea[], userId: string) {
  const totales = agrupar(lineas);
  const productos = await tx.producto.findMany({ where: { id: { in: [...totales.keys()] }, controlaStock: true } });
  for (const producto of productos) {
    const total = totales.get(producto.id)!;
    const descontado = await tx.producto.updateMany({ where: { id: producto.id, stock: { gte: total } }, data: { stock: { decrement: total } } });
    if (descontado.count === 0) {
      const actual = await tx.producto.findUniqueOrThrow({ where: { id: producto.id }, select: { stock: true } });
      throw new ErrorDeNegocio(`Solo quedan ${actual.stock} de ${producto.nombre}. Ajusta la cantidad.`, 409);
    }
    let stock = (await tx.producto.findUniqueOrThrow({ where: { id: producto.id }, select: { stock: true } })).stock + total;
    for (const linea of lineas.filter((l) => l.productoId === producto.id)) {
      stock -= linea.cantidad;
      await tx.movimientoInventario.create({
        data: { productoId: producto.id, tipo: "VENTA", cantidad: -linea.cantidad, stockResultante: stock, pedidoItemId: linea.pedidoItemId, userId },
      });
    }
  }
}

// Lo cancelado que no se alcanzó a usar vuelve al inventario.
export async function devolverStock(tx: Prisma.TransactionClient, lineas: Linea[], userId: string) {
  const totales = agrupar(lineas);
  const productos = await tx.producto.findMany({ where: { id: { in: [...totales.keys()] }, controlaStock: true }, select: { id: true } });
  for (const { id } of productos) {
    for (const linea of lineas.filter((l) => l.productoId === id)) {
      const { stock } = await tx.producto.update({ where: { id }, data: { stock: { increment: linea.cantidad } }, select: { stock: true } });
      await tx.movimientoInventario.create({
        data: { productoId: id, tipo: "DEVOLUCION", cantidad: linea.cantidad, stockResultante: stock, pedidoItemId: linea.pedidoItemId, userId, nota: "Cancelado antes de usarse" },
      });
    }
  }
}

// Después de confirmar la transacción: agota solo lo que llegó a cero,
// reactiva lo que se había agotado por inventario y volvió a tener, y avisa
// una sola vez cuando algo baja del mínimo. Cada cambio es condicional, así
// que no se repite aunque dos ventas terminen a la vez.
export async function revisarStock(productoIds: string[]) {
  const productos = await prisma.producto.findMany({ where: { id: { in: productoIds }, controlaStock: true } });
  for (const p of productos) {
    if (p.stock <= 0 && p.disponible) {
      const agotado = await prisma.producto.updateMany({
        where: { id: p.id, disponible: true, stock: { lte: 0 } },
        data: { disponible: false, agotadoPorStock: true },
      });
      if (agotado.count > 0) {
        emitProductoActualizado({ ...p, disponible: false, agotadoPorStock: true });
        const mensaje = `Se agotó ${p.nombre}: el inventario llegó a cero y ya no se puede pedir.`;
        await notificarPorRol({ rol: "ADMIN", tipo: "STOCK", mensaje, enlace: ENLACE_INVENTARIO });
        await notificarPorRol({ rol: "COCINA", tipo: "STOCK", mensaje });
      }
      continue;
    }
    if (p.stock > 0 && p.agotadoPorStock && !p.disponible) {
      const reactivado = await prisma.producto.updateMany({
        where: { id: p.id, agotadoPorStock: true, disponible: false, stock: { gt: 0 } },
        data: { disponible: true, agotadoPorStock: false },
      });
      if (reactivado.count > 0) emitProductoActualizado({ ...p, disponible: true, agotadoPorStock: false });
    }
    if (p.stock > 0 && p.stock <= p.stockMinimo && !p.alertaStockBajo) {
      const marcado = await prisma.producto.updateMany({ where: { id: p.id, alertaStockBajo: false }, data: { alertaStockBajo: true } });
      if (marcado.count > 0) {
        await notificarPorRol({
          rol: "ADMIN",
          tipo: "STOCK",
          mensaje: `Quedan ${p.stock} de ${p.nombre} (mínimo ${p.stockMinimo}). Es hora de pedir más.`,
          enlace: ENLACE_INVENTARIO,
        });
      }
    } else if (p.stock > p.stockMinimo && p.alertaStockBajo) {
      await prisma.producto.update({ where: { id: p.id }, data: { alertaStockBajo: false } });
    }
  }
}
