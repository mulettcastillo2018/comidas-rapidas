-- CreateEnum
CREATE TYPE "NotificacionTipo" AS ENUM ('PEDIDO_NUEVO', 'ITEM_RETRASADO', 'ITEM_LISTO');

-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "retrasoNotificado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "NotificacionTipo" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "pedidoId" TEXT,
    "pedidoItemId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
