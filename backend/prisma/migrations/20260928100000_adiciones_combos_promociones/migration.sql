-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "descuentoAutorizadoPorId" TEXT,
ADD COLUMN     "descuentoMonto" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "descuentoMotivo" TEXT;

-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "comboGrupo" TEXT,
ADD COLUMN     "comboNombre" TEXT,
ADD COLUMN     "precioLista" INTEGER,
ADD COLUMN     "promocionNombre" TEXT;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "esCombo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SolicitudPedidoItem" ADD COLUMN     "adicionIds" TEXT[];

-- CreateTable
CREATE TABLE "ComboComponente" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "ComboComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adicion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL DEFAULT 0,
    "costo" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoAdicion" (
    "productoId" TEXT NOT NULL,
    "adicionId" TEXT NOT NULL,

    CONSTRAINT "ProductoAdicion_pkey" PRIMARY KEY ("productoId","adicionId")
);

-- CreateTable
CREATE TABLE "PedidoItemAdicion" (
    "id" TEXT NOT NULL,
    "pedidoItemId" TEXT NOT NULL,
    "adicionId" TEXT,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "costo" INTEGER,

    CONSTRAINT "PedidoItemAdicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promocion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descuentoPct" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "diasSemana" INTEGER[],
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "desde" TIMESTAMP(3),
    "hasta" TIMESTAMP(3),
    "productoIds" TEXT[],
    "categoriaIds" TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promocion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComboComponente_comboId_productoId_key" ON "ComboComponente"("comboId", "productoId");

-- CreateIndex
CREATE INDEX "PedidoItemAdicion_pedidoItemId_idx" ON "PedidoItemAdicion"("pedidoItemId");

-- AddForeignKey
ALTER TABLE "ComboComponente" ADD CONSTRAINT "ComboComponente_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponente" ADD CONSTRAINT "ComboComponente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoAdicion" ADD CONSTRAINT "ProductoAdicion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoAdicion" ADD CONSTRAINT "ProductoAdicion_adicionId_fkey" FOREIGN KEY ("adicionId") REFERENCES "Adicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItemAdicion" ADD CONSTRAINT "PedidoItemAdicion_pedidoItemId_fkey" FOREIGN KEY ("pedidoItemId") REFERENCES "PedidoItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_descuentoAutorizadoPorId_fkey" FOREIGN KEY ("descuentoAutorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Datos: las solicitudes ya existentes quedan "sin adiciones" (lista vacía)
-- en vez de NULL.
UPDATE "SolicitudPedidoItem" SET "adicionIds" = ARRAY[]::TEXT[] WHERE "adicionIds" IS NULL;
