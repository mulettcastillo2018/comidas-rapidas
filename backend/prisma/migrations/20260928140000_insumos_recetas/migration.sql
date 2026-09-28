-- CreateEnum
CREATE TYPE "UnidadInsumo" AS ENUM ('GRAMO', 'MILILITRO', 'UNIDAD');

-- CreateEnum
CREATE TYPE "TipoMovimientoInsumo" AS ENUM ('COMPRA', 'CONSUMO', 'DEVOLUCION', 'AJUSTE');

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "costoDesdeReceta" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" "UnidadInsumo" NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costoUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertaStockBajo" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaItem" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RecetaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdicionInsumo" (
    "adicionId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AdicionInsumo_pkey" PRIMARY KEY ("adicionId","insumoId")
);

-- CreateTable
CREATE TABLE "MovimientoInsumo" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoInsumo" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "stockResultante" DOUBLE PRECISION NOT NULL,
    "costoTotal" INTEGER,
    "nota" TEXT,
    "userId" TEXT,
    "pedidoItemId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_nombre_key" ON "Insumo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaItem_productoId_insumoId_key" ON "RecetaItem"("productoId", "insumoId");

-- CreateIndex
CREATE INDEX "MovimientoInsumo_insumoId_creadoEn_idx" ON "MovimientoInsumo"("insumoId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInsumo_pedidoItemId_idx" ON "MovimientoInsumo"("pedidoItemId");

-- AddForeignKey
ALTER TABLE "RecetaItem" ADD CONSTRAINT "RecetaItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaItem" ADD CONSTRAINT "RecetaItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdicionInsumo" ADD CONSTRAINT "AdicionInsumo_adicionId_fkey" FOREIGN KEY ("adicionId") REFERENCES "Adicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdicionInsumo" ADD CONSTRAINT "AdicionInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInsumo" ADD CONSTRAINT "MovimientoInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInsumo" ADD CONSTRAINT "MovimientoInsumo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

