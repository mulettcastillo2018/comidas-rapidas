-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('ENTRADA', 'SALIDA', 'ENTREGA_MESERO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MetodoPago" ADD VALUE 'NEQUI';
ALTER TYPE "MetodoPago" ADD VALUE 'DAVIPLATA';
ALTER TYPE "MetodoPago" ADD VALUE 'TRANSFERENCIA';

-- AlterTable
ALTER TABLE "CierreCaja" ADD COLUMN     "totalDaviplata" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalEntradas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalNequi" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSalidas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTransferencia" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "costoUnitario" INTEGER;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "costo" INTEGER;

-- CreateTable
CREATE TABLE "PagoFactura" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoFactura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "meseroId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cierreCajaId" TEXT,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoFactura_facturaId_idx" ON "PagoFactura"("facturaId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cierreCajaId_idx" ON "MovimientoCaja"("cierreCajaId");

-- AddForeignKey
ALTER TABLE "PagoFactura" ADD CONSTRAINT "PagoFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cierreCajaId_fkey" FOREIGN KEY ("cierreCajaId") REFERENCES "CierreCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Datos: cada cuenta ya pagada queda con un único pago por su total y su
-- método, para que caja y reportes (que ahora suman por pagos) cuadren con
-- lo histórico. Solo usa métodos que ya existían antes de esta migración.
INSERT INTO "PagoFactura" ("id", "facturaId", "metodo", "monto", "creadoEn")
SELECT 'pago_' || "id", "id", "metodoPago", "total", COALESCE("pagadaEn", "generadaEn")
FROM "Factura"
WHERE "estado" = 'PAGADA' AND "metodoPago" IS NOT NULL;
