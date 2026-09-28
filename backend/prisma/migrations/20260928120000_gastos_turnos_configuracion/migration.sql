-- CreateEnum
CREATE TYPE "CategoriaGasto" AS ENUM ('INSUMOS', 'NOMINA', 'ARRIENDO', 'SERVICIOS', 'MANTENIMIENTO', 'PUBLICIDAD', 'IMPUESTOS', 'OTROS');

-- CreateEnum
CREATE TYPE "ModoPropina" AS ENUM ('PROPIAS', 'POZO');

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "categoria" "CategoriaGasto" NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "esFijo" BOOLEAN NOT NULL DEFAULT false,
    "movimientoCajaId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salida" TIMESTAMP(3),
    "editadoPorId" TEXT,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "propinaPctCocina" INTEGER NOT NULL DEFAULT 0,
    "propinaModo" "ModoPropina" NOT NULL DEFAULT 'PROPIAS',

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gasto_movimientoCajaId_key" ON "Gasto"("movimientoCajaId");

-- CreateIndex
CREATE INDEX "Gasto_fecha_idx" ON "Gasto"("fecha");

-- CreateIndex
CREATE INDEX "Turno_userId_entrada_idx" ON "Turno"("userId", "entrada");

-- CreateIndex
CREATE INDEX "Turno_entrada_idx" ON "Turno"("entrada");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_movimientoCajaId_fkey" FOREIGN KEY ("movimientoCajaId") REFERENCES "MovimientoCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

