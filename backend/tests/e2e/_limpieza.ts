import { prisma } from "../../src/lib/prisma";

// Lo que una prueba crea. Todo lo que cuelga de mesas con el prefijo de la
// prueba se encuentra solo; lo demás (pedidos de mostrador, cierres de caja,
// productos, usuarios) se anota a medida que se crea.
export interface Creados {
  prefijoMesas: string;
  pedidos: string[];
  solicitudes: string[];
  productos: string[];
  usuarios: string[];
  cierres: string[];
  // Texto que identifica notificaciones de la prueba (p. ej. el nombre del
  // cliente de mostrador de prueba).
  textos: string[];
}

export function registroDeCreados(prefijoMesas: string): Creados {
  return { prefijoMesas, pedidos: [], solicitudes: [], productos: [], usuarios: [], cierres: [], textos: [prefijoMesas] };
}

export async function limpiar(c: Creados) {
  // Un cierre de caja de prueba se deshace: las cuentas reales que tomó
  // vuelven a quedar pendientes de cerrar.
  await prisma.factura.updateMany({ where: { cierreCajaId: { in: c.cierres } }, data: { cierreCajaId: null } });
  await prisma.cierreCaja.deleteMany({ where: { id: { in: c.cierres } } });

  const deMesasDePrueba = { mesa: { numero: { startsWith: c.prefijoMesas } } };
  const sesiones = (await prisma.mesaSesion.findMany({ where: deMesasDePrueba, select: { id: true } })).map((s) => s.id);
  const pedidos = [
    ...c.pedidos,
    ...(await prisma.pedido.findMany({ where: { mesaSesionId: { in: sesiones } }, select: { id: true } })).map((p) => p.id),
  ];
  const solicitudes = [
    ...c.solicitudes,
    ...(await prisma.solicitudPedido.findMany({ where: { OR: [deMesasDePrueba, { pedidoId: { in: pedidos } }] }, select: { id: true } })).map((s) => s.id),
  ];

  await prisma.notificacion.deleteMany({
    where: { OR: [{ pedidoId: { in: pedidos } }, { userId: { in: c.usuarios } }, ...c.textos.map((t) => ({ mensaje: { contains: t } }))] },
  });
  await prisma.solicitudPedidoItem.deleteMany({ where: { solicitudId: { in: solicitudes } } });
  await prisma.solicitudPedido.deleteMany({ where: { id: { in: solicitudes } } });
  await prisma.factura.deleteMany({ where: { OR: [{ pedidoId: { in: pedidos } }, { mesaSesionId: { in: sesiones } }] } });
  await prisma.pedidoItemStatusLog.deleteMany({ where: { pedidoItem: { pedidoId: { in: pedidos } } } });
  await prisma.pedidoStatusLog.deleteMany({ where: { pedidoId: { in: pedidos } } });
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pedidos } } });
  await prisma.pedido.deleteMany({ where: { id: { in: pedidos } } });
  await prisma.comensal.deleteMany({ where: { mesaSesionId: { in: sesiones } } });
  await prisma.mesaSesion.deleteMany({ where: { id: { in: sesiones } } });
  await prisma.mesa.deleteMany({ where: { numero: { startsWith: c.prefijoMesas } } });
  await prisma.producto.deleteMany({ where: { id: { in: c.productos } } });
  await prisma.user.deleteMany({ where: { id: { in: c.usuarios } } });
}
