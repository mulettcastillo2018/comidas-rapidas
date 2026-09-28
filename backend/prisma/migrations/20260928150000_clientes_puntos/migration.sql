-- CreateEnum
CREATE TYPE "TipoMovimientoPuntos" AS ENUM ('ACUMULADO', 'CANJE', 'DEVOLUCION', 'AJUSTE');

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "minimoCanje" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "pesosPorPunto" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "puntosActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valorPunto" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "puntosAcreditados" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puntosCanjeados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "puntosGanados" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "autorizadoEn" TIMESTAMP(3) NOT NULL,
    "puntos" INTEGER NOT NULL DEFAULT 0,
    "visitas" INTEGER NOT NULL DEFAULT 0,
    "totalGastado" INTEGER NOT NULL DEFAULT 0,
    "ultimaVisita" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPuntos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoMovimientoPuntos" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "saldo" INTEGER NOT NULL,
    "facturaId" TEXT,
    "nota" TEXT,
    "userId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoPuntos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_telefono_key" ON "Cliente"("telefono");

-- CreateIndex
CREATE INDEX "MovimientoPuntos_clienteId_creadoEn_idx" ON "MovimientoPuntos"("clienteId", "creadoEn");

-- AddForeignKey
ALTER TABLE "MovimientoPuntos" ADD CONSTRAINT "MovimientoPuntos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPuntos" ADD CONSTRAINT "MovimientoPuntos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

