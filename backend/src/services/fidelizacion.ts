import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";

// Programa de puntos: el cliente se identifica con su celular, acumula puntos
// por lo que compra y los canjea como descuento en una cuenta.

export async function programaPuntos() {
  const c = await prisma.configuracion.upsert({ where: { id: "unica" }, create: {}, update: {} });
  return { activo: c.puntosActivo, pesosPorPunto: c.pesosPorPunto, valorPunto: c.valorPunto, minimoCanje: c.minimoCanje };
}

// Celular colombiano: 10 dígitos que empiezan por 3 (se aceptan con +57,
// espacios o guiones).
export function normalizarCelular(valor: string): string | null {
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("57")) digitos = digitos.slice(2);
  return /^3\d{9}$/.test(digitos) ? digitos : null;
}

export async function clientePorCelular(telefono: string) {
  const celular = normalizarCelular(telefono);
  if (!celular) return null;
  return prisma.cliente.findFirst({ where: { telefono: celular, eliminadoEn: null } });
}

// Suma los puntos de una cuenta pagada (una sola vez, aunque se llame dos).
// Cuentan los productos: no la propina ni el domicilio.
export async function acumularPuntos(facturaId: string) {
  const programa = await programaPuntos();
  const factura = await prisma.factura.findUnique({ where: { id: facturaId } });
  if (!factura || factura.estado !== "PAGADA" || !factura.clienteId || factura.puntosAcreditados) return;
  const base = Math.max(0, factura.subtotal - factura.descuentoMonto);
  const puntos = programa.activo ? Math.floor(base / programa.pesosPorPunto) : 0;
  await prisma.$transaction(async (tx) => {
    const marcada = await tx.factura.updateMany({ where: { id: facturaId, puntosAcreditados: false }, data: { puntosAcreditados: true, puntosGanados: puntos } });
    if (marcada.count === 0) return;
    const cliente = await tx.cliente.update({
      where: { id: factura.clienteId! },
      data: { puntos: { increment: puntos }, visitas: { increment: 1 }, totalGastado: { increment: factura.total - factura.propinaMonto }, ultimaVisita: new Date() },
    });
    if (puntos > 0) {
      await tx.movimientoPuntos.create({ data: { clienteId: cliente.id, tipo: "ACUMULADO", puntos, saldo: cliente.puntos, facturaId } });
    }
  });
}

// Descuenta los puntos que se canjean en una cuenta (dentro de la transacción
// que la genera) y devuelve cuánto descuentan en pesos.
export async function canjearPuntos(tx: Prisma.TransactionClient, clienteId: string, puntos: number, maximoPesos: number, facturaId: string, userId: string) {
  const programa = await programaPuntos();
  if (!programa.activo) throw new ErrorDeNegocio("El programa de puntos no está activo", 409);
  if (puntos < programa.minimoCanje) throw new ErrorDeNegocio(`Se canjean mínimo ${programa.minimoCanje} puntos`, 400);
  const monto = puntos * programa.valorPunto;
  if (monto > maximoPesos) throw new ErrorDeNegocio(`Esos puntos (${monto.toLocaleString("es-CO")}) valen más que la cuenta`, 400);
  const tomado = await tx.cliente.updateMany({ where: { id: clienteId, eliminadoEn: null, puntos: { gte: puntos } }, data: { puntos: { decrement: puntos } } });
  if (tomado.count === 0) throw new ErrorDeNegocio("El cliente no tiene suficientes puntos", 409);
  const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: clienteId } });
  await tx.movimientoPuntos.create({ data: { clienteId, tipo: "CANJE", puntos: -puntos, saldo: cliente.puntos, facturaId, userId } });
  return monto;
}

// Si la cuenta con canje termina en "se fue sin pagar", los puntos vuelven.
export async function devolverCanje(facturaId: string) {
  const factura = await prisma.factura.findUnique({ where: { id: facturaId } });
  if (!factura?.clienteId || factura.puntosCanjeados === 0) return;
  await prisma.$transaction(async (tx) => {
    const marcada = await tx.factura.updateMany({ where: { id: facturaId, puntosCanjeados: { gt: 0 } }, data: { puntosCanjeados: 0 } });
    if (marcada.count === 0) return;
    const cliente = await tx.cliente.update({ where: { id: factura.clienteId! }, data: { puntos: { increment: factura.puntosCanjeados } } });
    await tx.movimientoPuntos.create({
      data: { clienteId: cliente.id, tipo: "DEVOLUCION", puntos: factura.puntosCanjeados, saldo: cliente.puntos, facturaId, nota: "La cuenta no se pagó" },
    });
  });
}

// Liga un cliente a una cuenta todavía sin cliente (al cobrar).
export async function asignarCliente(tx: Prisma.TransactionClient, facturaId: string, clienteId: string | undefined) {
  if (!clienteId) return;
  const cliente = await tx.cliente.findFirst({ where: { id: clienteId, eliminadoEn: null } });
  if (!cliente) throw new ErrorDeNegocio("Cliente no encontrado", 404);
  await tx.factura.updateMany({ where: { id: facturaId, clienteId: null }, data: { clienteId } });
}

export function clienteDelCobro(cuerpo: unknown): string | undefined {
  const valor = (cuerpo as { clienteId?: unknown } | null)?.clienteId;
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}
