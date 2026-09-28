-- Pedido: la mesa deja de ser obligatoria (pedidos de mostrador sin mesa)
ALTER TABLE "Pedido" ALTER COLUMN "mesaSesionId" DROP NOT NULL;
ALTER TABLE "Pedido" ADD COLUMN "nombreCliente" TEXT;
ALTER TABLE "Pedido" ADD COLUMN "telefonoCliente" TEXT;

-- SolicitudPedido: idem, para la solicitud que arma el cliente por QR
ALTER TABLE "SolicitudPedido" ALTER COLUMN "mesaId" DROP NOT NULL;
ALTER TABLE "SolicitudPedido" ADD COLUMN "telefonoCliente" TEXT;

-- Factura: puede ligarse a un Pedido de mostrador en vez de a una MesaSesion
ALTER TABLE "Factura" ALTER COLUMN "mesaSesionId" DROP NOT NULL;
ALTER TABLE "Factura" ADD COLUMN "pedidoId" TEXT;
CREATE UNIQUE INDEX "Factura_pedidoId_key" ON "Factura"("pedidoId");
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
