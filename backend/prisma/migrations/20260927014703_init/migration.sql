-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MESERO', 'COCINA');

-- CreateEnum
CREATE TYPE "MesaEstado" AS ENUM ('LIBRE', 'OCUPADA');

-- CreateEnum
CREATE TYPE "MesaSesionEstado" AS ENUM ('ABIERTA', 'CUENTA_SOLICITADA', 'CERRADA');

-- CreateEnum
CREATE TYPE "PedidoEstado" AS ENUM ('RECIBIDO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FacturaEstado" AS ENUM ('PENDIENTE', 'PAGADA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'OTRO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icono" TEXT,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "tiempoPreparacionMinutos" INTEGER NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "imagenUrl" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "estado" "MesaEstado" NOT NULL DEFAULT 'LIBRE',

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaSesion" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "meseroId" TEXT NOT NULL,
    "nombreResponsable" TEXT NOT NULL,
    "estado" "MesaSesionEstado" NOT NULL DEFAULT 'ABIERTA',
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),

    CONSTRAINT "MesaSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comensal" (
    "id" TEXT NOT NULL,
    "mesaSesionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Comensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "mesaSesionId" TEXT NOT NULL,
    "meseroId" TEXT NOT NULL,
    "estado" "PedidoEstado" NOT NULL DEFAULT 'RECIBIDO',
    "notasGenerales" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEn" TIMESTAMP(3),
    "listoEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoItem" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "comensalId" TEXT,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "notas" TEXT,
    "precioUnitario" INTEGER NOT NULL,
    "tiempoPreparacionMinutos" INTEGER NOT NULL,

    CONSTRAINT "PedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoStatusLog" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "deEstado" "PedidoEstado",
    "aEstado" "PedidoEstado" NOT NULL,
    "cambiadoPorId" TEXT NOT NULL,
    "cambiadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "mesaSesionId" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "propinaMonto" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "estado" "FacturaEstado" NOT NULL DEFAULT 'PENDIENTE',
    "metodoPago" "MetodoPago",
    "generadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadaEn" TIMESTAMP(3),
    "cerradaPorId" TEXT,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_numero_key" ON "Mesa"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_mesaSesionId_key" ON "Factura"("mesaSesionId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaSesion" ADD CONSTRAINT "MesaSesion_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaSesion" ADD CONSTRAINT "MesaSesion_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comensal" ADD CONSTRAINT "Comensal_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_comensalId_fkey" FOREIGN KEY ("comensalId") REFERENCES "Comensal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoStatusLog" ADD CONSTRAINT "PedidoStatusLog_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoStatusLog" ADD CONSTRAINT "PedidoStatusLog_cambiadoPorId_fkey" FOREIGN KEY ("cambiadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_mesaSesionId_fkey" FOREIGN KEY ("mesaSesionId") REFERENCES "MesaSesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
