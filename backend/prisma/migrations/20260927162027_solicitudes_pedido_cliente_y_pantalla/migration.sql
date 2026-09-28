-- CreateEnum
CREATE TYPE "SolicitudPedidoEstado" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'DESCARTADA');

-- AlterEnum
ALTER TYPE "NotificacionTipo" ADD VALUE 'SOLICITUD_PEDIDO_CLIENTE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PANTALLA';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "origenCliente" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SolicitudPedido" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "nombreCliente" TEXT,
    "estado" "SolicitudPedidoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaEn" TIMESTAMP(3),
    "resueltaPorId" TEXT,
    "pedidoId" TEXT,

    CONSTRAINT "SolicitudPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudPedidoItem" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "notas" TEXT,

    CONSTRAINT "SolicitudPedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudPedido_pedidoId_key" ON "SolicitudPedido"("pedidoId");

-- AddForeignKey
ALTER TABLE "SolicitudPedido" ADD CONSTRAINT "SolicitudPedido_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudPedido" ADD CONSTRAINT "SolicitudPedido_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudPedido" ADD CONSTRAINT "SolicitudPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudPedidoItem" ADD CONSTRAINT "SolicitudPedidoItem_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudPedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudPedidoItem" ADD CONSTRAINT "SolicitudPedidoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
