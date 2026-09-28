-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "cierreCajaId" TEXT;
-- CreateTable
CREATE TABLE "CierreCaja" (
    "id" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoPorId" TEXT NOT NULL,
    "cuentasPagadas" INTEGER NOT NULL,
    "totalEfectivo" INTEGER NOT NULL,
    "totalTarjeta" INTEGER NOT NULL,
    "totalOtro" INTEGER NOT NULL,
    "propinas" INTEGER NOT NULL,
    "cuentasPerdidas" INTEGER NOT NULL,
    "totalPerdidas" INTEGER NOT NULL,
    "baseInicial" INTEGER NOT NULL,
    "efectivoContado" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,
    "notas" TEXT,
    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Factura_cierreCajaId_idx" ON "Factura"("cierreCajaId");
-- CreateIndex
CREATE INDEX "Factura_estado_pagadaEn_idx" ON "Factura"("estado", "pagadaEn");
-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_cierreCajaId_fkey" FOREIGN KEY ("cierreCajaId") REFERENCES "CierreCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
