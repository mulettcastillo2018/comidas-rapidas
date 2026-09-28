-- AlterTable
ALTER TABLE "SolicitudPedido" ADD COLUMN     "codigoSeguimiento" TEXT,
ADD COLUMN     "datosAutorizadosEn" TIMESTAMP(3);
-- CreateIndex
CREATE UNIQUE INDEX "SolicitudPedido_codigoSeguimiento_key" ON "SolicitudPedido"("codigoSeguimiento");
