import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// La base está en la nube y un cobro encadena varias consultas en una sola
// transacción (pedido, cuenta, pagos...): con la latencia de la red, el
// límite por defecto de Prisma (5 s) se queda corto en un momento lento.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
