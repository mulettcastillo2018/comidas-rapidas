
-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'VENTA', 'DEVOLUCION', 'AJUSTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificacionTipo" ADD VALUE 'AUTORIZACION';
ALTER TYPE "NotificacionTipo" ADD VALUE 'STOCK';

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "autorizadaPorId" TEXT;

-- AlterTable
ALTER TABLE "PedidoItemStatusLog" ADD COLUMN     "autorizadoPorId" TEXT;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "agotadoPorStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alertaStockBajo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "controlaStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockMinimo" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stockResultante" INTEGER NOT NULL,
    "nota" TEXT,
    "userId" TEXT,
    "pedidoItemId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoInventario_productoId_creadoEn_idx" ON "MovimientoInventario"("productoId", "creadoEn");

-- AddForeignKey
ALTER TABLE "PedidoItemStatusLog" ADD CONSTRAINT "PedidoItemStatusLog_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_autorizadaPorId_fkey" FOREIGN KEY ("autorizadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

