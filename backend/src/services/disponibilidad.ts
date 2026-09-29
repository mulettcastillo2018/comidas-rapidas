import type { Prisma, ProductoSede } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Cómo está cada producto en una sede ("agotado" e inventario por unidades).
// Sin fila en ProductoSede = disponible y sin control de inventario.
export type EstadoEnSede = Pick<ProductoSede, "disponible" | "controlaStock" | "stock" | "stockMinimo" | "agotadoPorStock" | "alertaStockBajo">;

export const ESTADO_PREDETERMINADO: EstadoEnSede = {
  disponible: true,
  controlaStock: false,
  stock: 0,
  stockMinimo: 0,
  agotadoPorStock: false,
  alertaStockBajo: false,
};

type Cliente = Prisma.TransactionClient | typeof prisma;

export async function estadosEnSede(cliente: Cliente, productoIds: string[], sedeId: string): Promise<Map<string, EstadoEnSede>> {
  const filas = productoIds.length > 0 ? await cliente.productoSede.findMany({ where: { sedeId, productoId: { in: productoIds } } }) : [];
  const porId = new Map(filas.map(({ productoId, sedeId: _s, ...estado }) => [productoId, estado as EstadoEnSede]));
  return new Map(productoIds.map((id) => [id, porId.get(id) ?? ESTADO_PREDETERMINADO]));
}

// Agrega a cada producto su estado en la sede (mismos campos que tenía antes
// el producto, así la pantalla no cambia).
export async function conEstadoEnSede<P extends { id: string }>(productos: P[], sedeId: string, cliente: Cliente = prisma): Promise<(P & EstadoEnSede)[]> {
  const estados = await estadosEnSede(cliente, productos.map((p) => p.id), sedeId);
  return productos.map((p) => ({ ...p, ...estados.get(p.id)! }));
}

export async function estadoEnSede(productoId: string, sedeId: string, cliente: Cliente = prisma): Promise<EstadoEnSede> {
  return (await estadosEnSede(cliente, [productoId], sedeId)).get(productoId)!;
}

// Crea la fila si no existía (con los valores por defecto) y aplica el cambio.
export function actualizarEnSede(cliente: Cliente, productoId: string, sedeId: string, datos: Partial<EstadoEnSede>) {
  return cliente.productoSede.upsert({
    where: { productoId_sedeId: { productoId, sedeId } },
    create: { productoId, sedeId, ...datos },
    update: datos,
  });
}
