import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notificarPorRol } from "./notificaciones";

// Inventario por ingrediente: cada producto tiene su receta (120 g de carne,
// 1 pan, 15 ml de salsa...) y cada venta descuenta lo que usó. A diferencia
// del inventario por unidades, no frena la venta si el sistema cree que no
// hay (los conteos de cocina nunca son exactos): avisa, y el conteo físico
// deja ver cuánto se pierde.

const ENLACE = "/admin/inventario?vista=insumos";

export interface ItemVendido {
  pedidoItemId: string;
  productoId: string;
  cantidad: number;
  adicionIds: string[];
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

// Descuenta los insumos de lo vendido, dentro de la transacción del pedido.
export async function consumirInsumos(tx: Prisma.TransactionClient, items: ItemVendido[], userId: string) {
  if (items.length === 0) return;
  const [recetas, deAdiciones] = await Promise.all([
    tx.recetaItem.findMany({ where: { productoId: { in: [...new Set(items.map((i) => i.productoId))] } } }),
    tx.adicionInsumo.findMany({ where: { adicionId: { in: [...new Set(items.flatMap((i) => i.adicionIds))] } } }),
  ]);
  if (recetas.length === 0 && deAdiciones.length === 0) return;

  // Por producto vendido, cuánto de cada insumo.
  const consumos: { pedidoItemId: string; insumoId: string; cantidad: number }[] = [];
  for (const item of items) {
    const porInsumo = new Map<string, number>();
    for (const r of recetas.filter((r) => r.productoId === item.productoId)) porInsumo.set(r.insumoId, (porInsumo.get(r.insumoId) ?? 0) + r.cantidad * item.cantidad);
    for (const a of deAdiciones.filter((a) => item.adicionIds.includes(a.adicionId))) porInsumo.set(a.insumoId, (porInsumo.get(a.insumoId) ?? 0) + a.cantidad * item.cantidad);
    for (const [insumoId, cantidad] of porInsumo) consumos.push({ pedidoItemId: item.pedidoItemId, insumoId, cantidad: redondear(cantidad) });
  }

  const totales = new Map<string, number>();
  for (const c of consumos) totales.set(c.insumoId, (totales.get(c.insumoId) ?? 0) + c.cantidad);
  const resultantes = new Map<string, number>();
  for (const [insumoId, total] of totales) {
    const { stock } = await tx.insumo.update({ where: { id: insumoId }, data: { stock: { decrement: total } }, select: { stock: true } });
    resultantes.set(insumoId, stock);
  }
  await tx.movimientoInsumo.createMany({
    data: consumos.map((c) => ({ insumoId: c.insumoId, tipo: "CONSUMO" as const, cantidad: -c.cantidad, stockResultante: resultantes.get(c.insumoId)!, pedidoItemId: c.pedidoItemId, userId })),
  });
}

// Lo cancelado antes de que cocina lo empezara no gastó nada: vuelve.
export async function devolverInsumos(tx: Prisma.TransactionClient, pedidoItemIds: string[], userId: string) {
  if (pedidoItemIds.length === 0) return [];
  const movimientos = await tx.movimientoInsumo.findMany({ where: { pedidoItemId: { in: pedidoItemIds }, tipo: { in: ["CONSUMO", "DEVOLUCION"] } } });
  // Neto por producto e insumo (por si ya se devolvió algo antes).
  const netos = new Map<string, { pedidoItemId: string; insumoId: string; cantidad: number }>();
  for (const m of movimientos) {
    const clave = `${m.pedidoItemId}|${m.insumoId}`;
    const n = netos.get(clave) ?? { pedidoItemId: m.pedidoItemId!, insumoId: m.insumoId, cantidad: 0 };
    n.cantidad += -m.cantidad;
    netos.set(clave, n);
  }
  const devoluciones = [...netos.values()].filter((n) => n.cantidad > 0.0005);
  for (const d of devoluciones) {
    const { stock } = await tx.insumo.update({ where: { id: d.insumoId }, data: { stock: { increment: d.cantidad } }, select: { stock: true } });
    await tx.movimientoInsumo.create({
      data: { insumoId: d.insumoId, tipo: "DEVOLUCION", cantidad: redondear(d.cantidad), stockResultante: stock, pedidoItemId: d.pedidoItemId, userId, nota: "Cancelado antes de prepararse" },
    });
  }
  return [...new Set(devoluciones.map((d) => d.insumoId))];
}

// Insumos que usa lo vendido (para revisar sus alertas después).
export async function insumosDe(productoIds: string[], adicionIds: string[] = []) {
  const [r, a] = await Promise.all([
    prisma.recetaItem.findMany({ where: { productoId: { in: productoIds } }, select: { insumoId: true } }),
    adicionIds.length ? prisma.adicionInsumo.findMany({ where: { adicionId: { in: adicionIds } }, select: { insumoId: true } }) : [],
  ]);
  return [...new Set([...r, ...a].map((x) => x.insumoId))];
}

// Avisa una sola vez cuando un insumo baja del mínimo.
export async function revisarInsumos(insumoIds: string[]) {
  if (insumoIds.length === 0) return;
  const insumos = await prisma.insumo.findMany({ where: { id: { in: insumoIds }, activo: true } });
  for (const i of insumos) {
    if (i.stock <= i.stockMinimo && !i.alertaStockBajo) {
      const marcado = await prisma.insumo.updateMany({ where: { id: i.id, alertaStockBajo: false }, data: { alertaStockBajo: true } });
      if (marcado.count > 0) {
        const quedan = i.stock <= 0 ? "Se acabó" : `Quedan ${formatoCantidad(i.stock, i.unidad)} de`;
        await notificarPorRol({ rol: "ADMIN", tipo: "STOCK", mensaje: `${quedan} ${i.nombre} según las recetas (mínimo ${formatoCantidad(i.stockMinimo, i.unidad)}).`, enlace: ENLACE });
      }
    } else if (i.stock > i.stockMinimo && i.alertaStockBajo) {
      await prisma.insumo.update({ where: { id: i.id }, data: { alertaStockBajo: false } });
    }
  }
}

export function formatoCantidad(cantidad: number, unidad: string) {
  const n = Math.round(cantidad * 100) / 100;
  if (unidad === "GRAMO") return Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} kg` : `${n.toLocaleString("es-CO")} g`;
  if (unidad === "MILILITRO") return Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} L` : `${n.toLocaleString("es-CO")} ml`;
  return `${n.toLocaleString("es-CO")} und`;
}

// Costo de un plato según su receta y el costo actual de cada insumo.
export function costoDeReceta(items: { cantidad: number; insumo: { costoUnitario: number } }[]) {
  return Math.round(items.reduce((s, i) => s + i.cantidad * i.insumo.costoUnitario, 0));
}

// Actualiza el costo de los productos que lo calculan desde su receta, y el
// de las adiciones que tienen insumos (p. ej. después de una compra que cambió
// el precio de la carne). Solo afecta lo que se venda de aquí en adelante.
export async function recalcularCostos(insumoIds?: string[]) {
  const filtro = insumoIds ? { some: { insumoId: { in: insumoIds } } } : { some: {} };
  const [productos, adiciones] = await Promise.all([
    prisma.producto.findMany({ where: { costoDesdeReceta: true, receta: filtro }, include: { receta: { include: { insumo: true } } } }),
    prisma.adicion.findMany({ where: { insumos: filtro }, include: { insumos: { include: { insumo: true } } } }),
  ]);
  for (const p of productos) {
    const costo = costoDeReceta(p.receta);
    if (costo !== p.costo) await prisma.producto.update({ where: { id: p.id }, data: { costo } });
  }
  for (const a of adiciones) {
    const costo = costoDeReceta(a.insumos);
    if (costo !== a.costo) await prisma.adicion.update({ where: { id: a.id }, data: { costo } });
  }
}
