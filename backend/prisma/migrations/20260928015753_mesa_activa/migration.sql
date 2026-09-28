-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_mesaSesionId_fkey";

-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_pedidoId_fkey";

-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesaSesionId_fkey";

-- DropForeignKey
ALTER TABLE "SolicitudPedido" DROP CONSTRAINT "SolicitudPedido_mesaId_fkey";

-- AlterTable
ALTER TABLE "Mesa" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudPedido" ADD CONSTRAINT "SolicitudPedido_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
