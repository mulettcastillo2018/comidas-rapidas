import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";
import { emitProductoActualizado } from "../realtime/socket";
import { notificarPorRol } from "./notificaciones";
import { nombreSede, sedes } from "./sedes";

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

// Descuenta lo vendido de los productos con inventario en esa sede, dentro de
// la misma transacción que crea el pedido. El descuento es condicional ("solo
// si hay suficiente"): si dos pedidos piden la última gaseosa a la vez, uno
// pasa y el otro recibe "solo quedan 0".
export async function descontarStock(tx: Prisma.TransactionClient, lineas: Linea[], userId: string, sedeId: string) {
  const totales = agrupar(lineas);
  const conStock = await tx.productoSede.findMany({
    where: { sedeId, controlaStock: true, productoId: { in: [...totales.keys()] } },
    include: { producto: { select: { nombre: true } } },
  });
  for (const fila of conStock) {
    const total = totales.get(fila.productoId)!;
    const descontado = await tx.productoSede.updateMany({
      where: { productoId: fila.productoId, sedeId, stock: { gte: total } },
      data: { stock: { decrement: total } },
    });
    if (descontado.count === 0) {
      const actual = await tx.productoSede.findUniqueOrThrow({ where: { productoId_sedeId: { productoId: fila.productoId, sedeId } }, select: { stock: true } });
      throw new ErrorDeNegocio(`Solo quedan ${actual.stock} de ${fila.producto.nombre}. Ajusta la cantidad.`, 409);
    }
    let stock = (await tx.productoSede.findUniqueOrThrow({ where: { productoId_sedeId: { productoId: fila.productoId, sedeId } }, select: { stock: true } })).stock + total;
    for (const linea of lineas.filter((l) => l.productoId === fila.productoId)) {
      stock -= linea.cantidad;
      await tx.movimientoInventario.create({
        data: { productoId: fila.productoId, sedeId, tipo: "VENTA", cantidad: -linea.cantidad, stockResultante: stock, pedidoItemId: linea.pedidoItemId, userId },
      });
    }
  }
}

// Lo cancelado que no se alcanzó a usar vuelve al inventario de esa sede.
export async function devolverStock(tx: Prisma.TransactionClient, lineas: Linea[], userId: string, sedeId: string) {
  const totales = agrupar(lineas);
  const conStock = await tx.productoSede.findMany({ where: { sedeId, controlaStock: true, productoId: { in: [...totales.keys()] } }, select: { productoId: true } });
  for (const { productoId } of conStock) {
    for (const linea of lineas.filter((l) => l.productoId === productoId)) {
      const { stock } = await tx.productoSede.update({
        where: { productoId_sedeId: { productoId, sedeId } },
        data: { stock: { increment: linea.cantidad } },
        select: { stock: true },
      });
      await tx.movimientoInventario.create({
        data: { productoId, sedeId, tipo: "DEVOLUCION", cantidad: linea.cantidad, stockResultante: stock, pedidoItemId: linea.pedidoItemId, userId, nota: "Cancelado antes de usarse" },
      });
    }
  }
}

// Después de confirmar la transacción: agota solo lo que llegó a cero,
// reactiva lo que se había agotado por inventario y volvió a tener, y avisa
// una sola vez cuando algo baja del mínimo. Cada cambio es condicional, así
// que no se repite aunque dos ventas terminen a la vez.
export async function revisarStock(productoIds: string[], sedeId: string) {
  const filas = await prisma.productoSede.findMany({
    where: { sedeId, controlaStock: true, productoId: { in: productoIds } },
    include: { producto: { include: { categoria: true } } },
  });
  // Con varias sedes, el aviso dice de cuál.
  const enSede = (await sedes()).length > 1 ? ` en ${await nombreSede(sedeId)}` : "";
  for (const f of filas) {
    const { producto, ...estado } = f;
    const vista = { ...producto, ...estado };
    if (f.stock <= 0 && f.disponible) {
      const agotado = await prisma.productoSede.updateMany({
        where: { productoId: f.productoId, sedeId, disponible: true, stock: { lte: 0 } },
        data: { disponible: false, agotadoPorStock: true },
      });
      if (agotado.count > 0) {
        emitProductoActualizado({ ...vista, disponible: false, agotadoPorStock: true }, sedeId);
        const mensaje = `Se agotó ${producto.nombre}${enSede}: el inventario llegó a cero y ya no se puede pedir.`;
        await notificarPorRol({ rol: "ADMIN", sedeId, tipo: "STOCK", mensaje, enlace: ENLACE_INVENTARIO });
        await notificarPorRol({ rol: "COCINA", sedeId, tipo: "STOCK", mensaje });
      }
      continue;
    }
    if (f.stock > 0 && f.agotadoPorStock && !f.disponible) {
      const reactivado = await prisma.productoSede.updateMany({
        where: { productoId: f.productoId, sedeId, agotadoPorStock: true, disponible: false, stock: { gt: 0 } },
        data: { disponible: true, agotadoPorStock: false },
      });
      if (reactivado.count > 0) emitProductoActualizado({ ...vista, disponible: true, agotadoPorStock: false }, sedeId);
    }
    if (f.stock > 0 && f.stock <= f.stockMinimo && !f.alertaStockBajo) {
      const marcado = await prisma.productoSede.updateMany({ where: { productoId: f.productoId, sedeId, alertaStockBajo: false }, data: { alertaStockBajo: true } });
      if (marcado.count > 0) {
        await notificarPorRol({
          rol: "ADMIN",
          sedeId,
          tipo: "STOCK",
          mensaje: `Quedan ${f.stock} de ${producto.nombre}${enSede} (mínimo ${f.stockMinimo}). Es hora de pedir más.`,
          enlace: ENLACE_INVENTARIO,
        });
      }
    } else if (f.stock > f.stockMinimo && f.alertaStockBajo) {
      await prisma.productoSede.update({ where: { productoId_sedeId: { productoId: f.productoId, sedeId } }, data: { alertaStockBajo: false } });
    }
  }
}
