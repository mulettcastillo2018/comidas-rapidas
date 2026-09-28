-- CreateEnum
CREATE TYPE "CanalPedido" AS ENUM ('MESA', 'MOSTRADOR', 'DOMICILIO', 'PLATAFORMA');

-- CreateEnum
CREATE TYPE "EstadoDomicilio" AS ENUM ('PENDIENTE', 'EN_CAMINO', 'ENTREGADO', 'FALLIDO');

-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'PLATAFORMA';

-- AlterTable
ALTER TABLE "CierreCaja" ADD COLUMN     "totalPlataforma" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "comisionMonto" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "envioMonto" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "canal" "CanalPedido" NOT NULL DEFAULT 'MOSTRADOR',
ADD COLUMN     "codigoPlataforma" TEXT,
ADD COLUMN     "plataformaId" TEXT;

-- CreateTable
CREATE TABLE "Domicilio" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "direccion" TEXT,
    "barrio" TEXT,
    "indicaciones" TEXT,
    "pagaCon" INTEGER,
    "domiciliario" TEXT,
    "estado" "EstadoDomicilio" NOT NULL DEFAULT 'PENDIENTE',
    "salioEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),
    "motivoFallido" TEXT,

    CONSTRAINT "Domicilio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plataforma" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "comisionPct" DOUBLE PRECISION NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domicilio_pedidoId_key" ON "Domicilio"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Plataforma_nombre_key" ON "Plataforma"("nombre");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_plataformaId_fkey" FOREIGN KEY ("plataformaId") REFERENCES "Plataforma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domicilio" ADD CONSTRAINT "Domicilio_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Los pedidos de mesa ya existentes.
UPDATE "Pedido" SET "canal" = 'MESA' WHERE "mesaSesionId" IS NOT NULL;
