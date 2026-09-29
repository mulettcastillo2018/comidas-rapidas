-- Varias sedes. Todo lo existente queda en la sede "Principal", que hereda la
-- numeración POS y los datos de la caja que antes estaban en la configuración
-- de facturación.

-- 1. Sede principal
CREATE TABLE "Sede" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posResolucion" TEXT,
    "posPrefijo" TEXT,
    "posDesde" INTEGER,
    "posHasta" INTEGER,
    "posFechaInicio" TEXT,
    "posFechaFin" TEXT,
    "posSiguiente" INTEGER,
    "cajaPlaca" TEXT,
    "cajaUbicacion" TEXT,

    CONSTRAINT "Sede_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sede_nombre_key" ON "Sede"("nombre");

INSERT INTO "Sede" ("id", "nombre", "esPrincipal", "posResolucion", "posPrefijo", "posDesde", "posHasta", "posFechaInicio", "posFechaFin", "posSiguiente", "cajaPlaca", "cajaUbicacion")
SELECT 'sede-principal', 'Principal', true, c."posResolucion", c."posPrefijo", c."posDesde", c."posHasta", c."posFechaInicio", c."posFechaFin", c."posSiguiente", c."cajaPlaca", c."cajaUbicacion"
FROM (SELECT 1) AS uno LEFT JOIN "ConfiguracionFiscal" c ON c."id" = 'unica';

-- 2. Columnas de sede: se llenan con la principal y luego se vuelven obligatorias
ALTER TABLE "User" ADD COLUMN "sedeId" TEXT;
-- Los administradores quedan como generales (ven todas las sedes); el resto
-- del personal trabaja en la principal.
UPDATE "User" SET "sedeId" = 'sede-principal' WHERE "role" <> 'ADMIN';

ALTER TABLE "Mesa" ADD COLUMN "sedeId" TEXT;
UPDATE "Mesa" SET "sedeId" = 'sede-principal';
ALTER TABLE "Mesa" ALTER COLUMN "sedeId" SET NOT NULL;
DROP INDEX "Mesa_numero_key";
CREATE UNIQUE INDEX "Mesa_sedeId_numero_key" ON "Mesa"("sedeId", "numero");

ALTER TABLE "Pedido" ADD COLUMN "sedeId" TEXT;
UPDATE "Pedido" SET "sedeId" = 'sede-principal';
ALTER TABLE "Pedido" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "Factura" ADD COLUMN "sedeId" TEXT;
UPDATE "Factura" SET "sedeId" = 'sede-principal';
ALTER TABLE "Factura" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "SolicitudPedido" ADD COLUMN "sedeId" TEXT;
UPDATE "SolicitudPedido" SET "sedeId" = 'sede-principal';
ALTER TABLE "SolicitudPedido" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "CierreCaja" ADD COLUMN "sedeId" TEXT;
UPDATE "CierreCaja" SET "sedeId" = 'sede-principal';
ALTER TABLE "CierreCaja" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "MovimientoCaja" ADD COLUMN "sedeId" TEXT;
UPDATE "MovimientoCaja" SET "sedeId" = 'sede-principal';
ALTER TABLE "MovimientoCaja" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "Turno" ADD COLUMN "sedeId" TEXT;
UPDATE "Turno" SET "sedeId" = 'sede-principal';
ALTER TABLE "Turno" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "MovimientoInventario" ADD COLUMN "sedeId" TEXT;
UPDATE "MovimientoInventario" SET "sedeId" = 'sede-principal';
ALTER TABLE "MovimientoInventario" ALTER COLUMN "sedeId" SET NOT NULL;

ALTER TABLE "MovimientoInsumo" ADD COLUMN "sedeId" TEXT;
UPDATE "MovimientoInsumo" SET "sedeId" = 'sede-principal';
ALTER TABLE "MovimientoInsumo" ALTER COLUMN "sedeId" SET NOT NULL;

-- Los gastos anteriores eran del único local que había.
ALTER TABLE "Gasto" ADD COLUMN "sedeId" TEXT;
UPDATE "Gasto" SET "sedeId" = 'sede-principal';

-- 3. Disponibilidad e inventario de productos, ahora por sede
CREATE TABLE "ProductoSede" (
    "productoId" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "controlaStock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "agotadoPorStock" BOOLEAN NOT NULL DEFAULT false,
    "alertaStockBajo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductoSede_pkey" PRIMARY KEY ("productoId","sedeId")
);
INSERT INTO "ProductoSede" ("productoId", "sedeId", "disponible", "controlaStock", "stock", "stockMinimo", "agotadoPorStock", "alertaStockBajo")
SELECT "id", 'sede-principal', "disponible", "controlaStock", "stock", "stockMinimo", "agotadoPorStock", "alertaStockBajo" FROM "Producto";

ALTER TABLE "Producto" DROP COLUMN "agotadoPorStock",
DROP COLUMN "alertaStockBajo",
DROP COLUMN "controlaStock",
DROP COLUMN "disponible",
DROP COLUMN "stock",
DROP COLUMN "stockMinimo";

-- 4. Stock de insumos, ahora por sede
CREATE TABLE "InsumoSede" (
    "insumoId" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertaStockBajo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InsumoSede_pkey" PRIMARY KEY ("insumoId","sedeId")
);
INSERT INTO "InsumoSede" ("insumoId", "sedeId", "stock", "stockMinimo", "alertaStockBajo")
SELECT "id", 'sede-principal', "stock", "stockMinimo", "alertaStockBajo" FROM "Insumo";

ALTER TABLE "Insumo" DROP COLUMN "alertaStockBajo",
DROP COLUMN "stock",
DROP COLUMN "stockMinimo";

-- 5. La numeración POS y la caja pasaron a la sede
ALTER TABLE "ConfiguracionFiscal" DROP COLUMN "cajaPlaca",
DROP COLUMN "cajaUbicacion",
DROP COLUMN "posDesde",
DROP COLUMN "posFechaFin",
DROP COLUMN "posFechaInicio",
DROP COLUMN "posHasta",
DROP COLUMN "posPrefijo",
DROP COLUMN "posResolucion",
DROP COLUMN "posSiguiente";

-- 6. Llaves foráneas
ALTER TABLE "User" ADD CONSTRAINT "User_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InsumoSede" ADD CONSTRAINT "InsumoSede_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InsumoSede" ADD CONSTRAINT "InsumoSede_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInsumo" ADD CONSTRAINT "MovimientoInsumo_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductoSede" ADD CONSTRAINT "ProductoSede_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductoSede" ADD CONSTRAINT "ProductoSede_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudPedido" ADD CONSTRAINT "SolicitudPedido_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
