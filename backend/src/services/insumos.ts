import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notificarPorRol } from "./notificaciones";
import { nombreSede, sedes } from "./sedes";

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

// Suma (o resta) al stock de un insumo en una sede, creando la fila si no
// existía. Devuelve el stock resultante.
export async function moverStock(tx: Prisma.TransactionClient, insumoId: string, sedeId: string, cantidad: number) {
  const { stock } = await tx.insumoSede.upsert({
    where: { insumoId_sedeId: { insumoId, sedeId } },
    create: { insumoId, sedeId, stock: cantidad },
    update: { stock: { increment: cantidad } },
    select: { stock: true },
  });
  return stock;
}

// Descuenta los insumos de lo vendido en esa sede, dentro de la transacción
// del pedido.
export async function consumirInsumos(tx: Prisma.TransactionClient, items: ItemVendido[], userId: string, sedeId: string) {
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
  for (const [insumoId, total] of totales) resultantes.set(insumoId, await moverStock(tx, insumoId, sedeId, -total));
  await tx.movimientoInsumo.createMany({
    data: consumos.map((c) => ({
      insumoId: c.insumoId,
      sedeId,
      tipo: "CONSUMO" as const,
      cantidad: -c.cantidad,
      stockResultante: resultantes.get(c.insumoId)!,
      pedidoItemId: c.pedidoItemId,
      userId,
    })),
  });
}

// Lo cancelado antes de que cocina lo empezara no gastó nada: vuelve.
export async function devolverInsumos(tx: Prisma.TransactionClient, pedidoItemIds: string[], userId: string) {
  if (pedidoItemIds.length === 0) return [];
  const movimientos = await tx.movimientoInsumo.findMany({ where: { pedidoItemId: { in: pedidoItemIds }, tipo: { in: ["CONSUMO", "DEVOLUCION"] } } });
  // Neto por producto e insumo (por si ya se devolvió algo antes). Vuelve a
  // la sede donde se consumió.
  const netos = new Map<string, { pedidoItemId: string; insumoId: string; sedeId: string; cantidad: number }>();
  for (const m of movimientos) {
    const clave = `${m.pedidoItemId}|${m.insumoId}`;
    const n = netos.get(clave) ?? { pedidoItemId: m.pedidoItemId!, insumoId: m.insumoId, sedeId: m.sedeId, cantidad: 0 };
    n.cantidad += -m.cantidad;
    netos.set(clave, n);
  }
  const devoluciones = [...netos.values()].filter((n) => n.cantidad > 0.0005);
  for (const d of devoluciones) {
    const stock = await moverStock(tx, d.insumoId, d.sedeId, d.cantidad);
    await tx.movimientoInsumo.create({
      data: {
        insumoId: d.insumoId,
        sedeId: d.sedeId,
        tipo: "DEVOLUCION",
        cantidad: redondear(d.cantidad),
        stockResultante: stock,
        pedidoItemId: d.pedidoItemId,
        userId,
        nota: "Cancelado antes de prepararse",
      },
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

// Avisa una sola vez cuando un insumo baja del mínimo en una sede.
export async function revisarInsumos(insumoIds: string[], sedeId: string) {
  if (insumoIds.length === 0) return;
  const filas = await prisma.insumoSede.findMany({ where: { sedeId, insumoId: { in: insumoIds }, insumo: { activo: true } }, include: { insumo: true } });
  const enSede = (await sedes()).length > 1 ? ` en ${await nombreSede(sedeId)}` : "";
  for (const f of filas) {
    const clave = { insumoId_sedeId: { insumoId: f.insumoId, sedeId } };
    if (f.stock <= f.stockMinimo && !f.alertaStockBajo) {
      const marcado = await prisma.insumoSede.updateMany({ where: { insumoId: f.insumoId, sedeId, alertaStockBajo: false }, data: { alertaStockBajo: true } });
      if (marcado.count > 0) {
        const quedan = f.stock <= 0 ? "Se acabó" : `Quedan ${formatoCantidad(f.stock, f.insumo.unidad)} de`;
        await notificarPorRol({
          rol: "ADMIN",
          sedeId,
          tipo: "STOCK",
          mensaje: `${quedan} ${f.insumo.nombre}${enSede} según las recetas (mínimo ${formatoCantidad(f.stockMinimo, f.insumo.unidad)}).`,
          enlace: ENLACE,
        });
      }
    } else if (f.stock > f.stockMinimo && f.alertaStockBajo) {
      await prisma.insumoSede.update({ where: clave, data: { alertaStockBajo: false } });
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
