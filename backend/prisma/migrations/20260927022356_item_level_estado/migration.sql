-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "estado" "PedidoEstado" NOT NULL DEFAULT 'RECIBIDO',
ADD COLUMN     "iniciadoEn" TIMESTAMP(3),
ADD COLUMN     "listoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PedidoItemStatusLog" (
    "id" TEXT NOT NULL,
    "pedidoItemId" TEXT NOT NULL,
    "deEstado" "PedidoEstado",
    "aEstado" "PedidoEstado" NOT NULL,
    "cambiadoPorId" TEXT NOT NULL,
    "cambiadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoItemStatusLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PedidoItemStatusLog" ADD CONSTRAINT "PedidoItemStatusLog_pedidoItemId_fkey" FOREIGN KEY ("pedidoItemId") REFERENCES "PedidoItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItemStatusLog" ADD CONSTRAINT "PedidoItemStatusLog_cambiadoPorId_fkey" FOREIGN KEY ("cambiadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
