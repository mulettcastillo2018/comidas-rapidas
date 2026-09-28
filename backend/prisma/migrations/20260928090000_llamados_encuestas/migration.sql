-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificacionTipo" ADD VALUE 'LLAMADO_MESA';
ALTER TYPE "NotificacionTipo" ADD VALUE 'OPINION';

-- AlterTable
ALTER TABLE "MesaSesion" ADD COLUMN     "codigoEncuesta" TEXT;

-- CreateTable
CREATE TABLE "Encuesta" (
    "id" TEXT NOT NULL,
    "mesaSesionId" TEXT,
    "solicitudId" TEXT,
    "meseroId" TEXT,
    "calificacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Encuesta_mesaSesionId_key" ON "Encuesta"("mesaSesionId");

-- CreateIndex
CREATE UNIQUE INDEX "Encuesta_solicitudId_key" ON "Encuesta"("solicitudId");

-- CreateIndex
CREATE INDEX "Encuesta_creadaEn_idx" ON "Encuesta"("creadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "MesaSesion_codigoEncuesta_key" ON "MesaSesion"("codigoEncuesta");

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudPedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

