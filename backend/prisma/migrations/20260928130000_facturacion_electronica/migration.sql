-- CreateEnum
CREATE TYPE "TipoDocumentoFiscal" AS ENUM ('FACTURA', 'POS', 'NOTA_CREDITO', 'NOTA_AJUSTE');

-- CreateEnum
CREATE TYPE "EstadoDocumentoFiscal" AS ENUM ('PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "ImpuestoVenta" AS ENUM ('INC', 'IVA', 'NINGUNO');

-- AlterEnum
ALTER TYPE "NotificacionTipo" ADD VALUE 'FACTURACION';

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "adquiriente" JSONB;

-- CreateTable
CREATE TABLE "DocumentoFiscal" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoFiscal" NOT NULL,
    "prefijo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoDocumentoFiscal" NOT NULL DEFAULT 'PENDIENTE',
    "contenido" JSONB NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "alanubeId" TEXT,
    "codigoUnico" TEXT,
    "qr" TEXT,
    "mensaje" TEXT,
    "errores" TEXT[],
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteNombre" TEXT NOT NULL,
    "clienteIdentificacion" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "anulaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionFiscal" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "activadaEn" TIMESTAMP(3),
    "alanubeUrl" TEXT NOT NULL DEFAULT 'https://sandbox-api.alegra.com/e-provider/col/v1',
    "alanubeToken" TEXT,
    "alanubeCompanyId" TEXT,
    "nit" TEXT,
    "dv" TEXT,
    "razonSocial" TEXT,
    "documentoPorDefecto" "TipoDocumentoFiscal" NOT NULL DEFAULT 'FACTURA',
    "impuesto" "ImpuestoVenta" NOT NULL DEFAULT 'INC',
    "impuestoPct" INTEGER NOT NULL DEFAULT 8,
    "feResolucion" TEXT,
    "fePrefijo" TEXT,
    "feDesde" INTEGER,
    "feHasta" INTEGER,
    "feFechaInicio" TEXT,
    "feFechaFin" TEXT,
    "feClaveTecnica" TEXT,
    "feSiguiente" INTEGER,
    "posResolucion" TEXT,
    "posPrefijo" TEXT,
    "posDesde" INTEGER,
    "posHasta" INTEGER,
    "posFechaInicio" TEXT,
    "posFechaFin" TEXT,
    "posSiguiente" INTEGER,
    "notaPrefijo" TEXT NOT NULL DEFAULT 'NC',
    "notaSiguiente" INTEGER NOT NULL DEFAULT 1,
    "ajustePrefijo" TEXT NOT NULL DEFAULT 'NA',
    "ajusteSiguiente" INTEGER NOT NULL DEFAULT 1,
    "cajaPlaca" TEXT,
    "cajaUbicacion" TEXT,

    CONSTRAINT "ConfiguracionFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_claveIdempotencia_key" ON "DocumentoFiscal"("claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_anulaId_key" ON "DocumentoFiscal"("anulaId");

-- CreateIndex
CREATE INDEX "DocumentoFiscal_estado_proximoIntento_idx" ON "DocumentoFiscal"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "DocumentoFiscal_facturaId_idx" ON "DocumentoFiscal"("facturaId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_tipo_prefijo_numero_key" ON "DocumentoFiscal"("tipo", "prefijo", "numero");

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_anulaId_fkey" FOREIGN KEY ("anulaId") REFERENCES "DocumentoFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

