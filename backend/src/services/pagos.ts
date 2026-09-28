import { z } from "zod";
import type { MetodoPago, Prisma } from "@prisma/client";
import { ErrorDeNegocio } from "../lib/errores";

export const METODOS_PAGO = ["EFECTIVO", "TARJETA", "NEQUI", "DAVIPLATA", "TRANSFERENCIA", "OTRO"] as const;

export const pagoSchema = z.object({ metodo: z.enum(METODOS_PAGO), monto: z.number().int().positive() });

// Se acepta un solo método ({ metodoPago }) o la cuenta dividida en varios
// pagos ({ pagos: [...] }), p. ej. parte en efectivo y parte por Nequi.
export const cobroSchema = z.union([
  z.object({ metodoPago: z.enum(METODOS_PAGO) }),
  z.object({ pagos: z.array(pagoSchema).min(1).max(20) }),
]);
export type Cobro = z.infer<typeof cobroSchema>;

export function pagosDelCobro(cobro: Cobro, total: number): { metodo: MetodoPago; monto: number }[] {
  if ("metodoPago" in cobro) return [{ metodo: cobro.metodoPago, monto: total }];
  const suma = cobro.pagos.reduce((s, p) => s + p.monto, 0);
  if (suma !== total) {
    throw new ErrorDeNegocio(
      `Los pagos suman ${suma.toLocaleString("es-CO")} y la cuenta es de ${total.toLocaleString("es-CO")}. Deben coincidir exactamente.`,
      400
    );
  }
  return cobro.pagos;
}

// Guarda los pagos de una cuenta y devuelve el método "principal" para la
// cuenta: el único si fue uno solo, o null si se dividió en varios métodos.
export async function registrarPagos(tx: Prisma.TransactionClient, facturaId: string, pagos: { metodo: MetodoPago; monto: number }[]) {
  await tx.pagoFactura.createMany({ data: pagos.map((p) => ({ facturaId, metodo: p.metodo, monto: p.monto })) });
  const metodos = new Set(pagos.map((p) => p.metodo));
  return metodos.size === 1 ? pagos[0].metodo : null;
}
