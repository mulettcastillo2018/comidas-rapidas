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
  movimientosCaja: string[];
  adiciones: string[];
  promociones: string[];
  plataformas: string[];
  gastos: string[];
  turnos: string[];
  insumos: string[];
  clientes: string[];
  // Texto que identifica notificaciones de la prueba (p. ej. el nombre del
  // cliente de mostrador de prueba).
  textos: string[];
}

export function registroDeCreados(prefijoMesas: string): Creados {
  return {
    prefijoMesas,
    pedidos: [],
    solicitudes: [],
    productos: [],
    usuarios: [],
    cierres: [],
    movimientosCaja: [],
    adiciones: [],
    promociones: [],
    plataformas: [],
    gastos: [],
    turnos: [],
    insumos: [],
    clientes: [],
    textos: [prefijoMesas],
  };
}

export async function limpiar(c: Creados) {
  // Un cierre de caja de prueba se deshace: las cuentas y movimientos reales
  // que tomó vuelven a quedar pendientes de cerrar.
  await prisma.factura.updateMany({ where: { cierreCajaId: { in: c.cierres } }, data: { cierreCajaId: null } });
  await prisma.movimientoCaja.updateMany({ where: { cierreCajaId: { in: c.cierres } }, data: { cierreCajaId: null } });
  const deGastos = (await prisma.gasto.findMany({ where: { id: { in: c.gastos } }, select: { movimientoCajaId: true } }))
    .map((g) => g.movimientoCajaId)
    .filter((id): id is string => Boolean(id));
  await prisma.gasto.deleteMany({ where: { id: { in: c.gastos } } });
  await prisma.movimientoCaja.deleteMany({ where: { id: { in: [...c.movimientosCaja, ...deGastos] } } });
  await prisma.turno.deleteMany({ where: { OR: [{ id: { in: c.turnos } }, { userId: { in: c.usuarios } }] } });
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
  await prisma.encuesta.deleteMany({ where: { OR: [{ mesaSesionId: { in: sesiones } }, { solicitudId: { in: solicitudes } }] } });
  await prisma.solicitudPedidoItem.deleteMany({ where: { solicitudId: { in: solicitudes } } });
  await prisma.solicitudPedido.deleteMany({ where: { id: { in: solicitudes } } });
  const deFacturas = { OR: [{ pedidoId: { in: pedidos } }, { mesaSesionId: { in: sesiones } }] };
  // Las notas primero: apuntan al documento que anulan.
  await prisma.documentoFiscal.deleteMany({ where: { factura: deFacturas, anulaId: { not: null } } });
  await prisma.documentoFiscal.deleteMany({ where: { factura: deFacturas } });
  await prisma.pagoFactura.deleteMany({ where: { factura: deFacturas } });
  await prisma.factura.deleteMany({ where: deFacturas });
  await prisma.movimientoPuntos.deleteMany({ where: { clienteId: { in: c.clientes } } });
  await prisma.factura.updateMany({ where: { clienteId: { in: c.clientes } }, data: { clienteId: null } });
  await prisma.cliente.deleteMany({ where: { id: { in: c.clientes } } });
  await prisma.pedidoItemStatusLog.deleteMany({ where: { pedidoItem: { pedidoId: { in: pedidos } } } });
  await prisma.pedidoStatusLog.deleteMany({ where: { pedidoId: { in: pedidos } } });
  await prisma.pedidoItemAdicion.deleteMany({ where: { pedidoItem: { pedidoId: { in: pedidos } } } });
  // Lo que esos pedidos consumieron de insumos reales vuelve a su inventario.
  const consumos = await prisma.movimientoInsumo.findMany({ where: { pedidoItemId: { in: (await prisma.pedidoItem.findMany({ where: { pedidoId: { in: pedidos } }, select: { id: true } })).map((i) => i.id) }, insumoId: { notIn: c.insumos } } });
  for (const m of consumos) await prisma.insumo.update({ where: { id: m.insumoId }, data: { stock: { decrement: m.cantidad } } });
  await prisma.movimientoInsumo.deleteMany({ where: { id: { in: consumos.map((m) => m.id) } } });
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pedidos } } });
  await prisma.domicilio.deleteMany({ where: { pedidoId: { in: pedidos } } });
  await prisma.pedido.deleteMany({ where: { id: { in: pedidos } } });
  await prisma.plataforma.deleteMany({ where: { id: { in: c.plataformas } } });
  await prisma.comensal.deleteMany({ where: { mesaSesionId: { in: sesiones } } });
  await prisma.mesaSesion.deleteMany({ where: { id: { in: sesiones } } });
  await prisma.mesa.deleteMany({ where: { numero: { startsWith: c.prefijoMesas } } });
  await prisma.movimientoInventario.deleteMany({ where: { productoId: { in: c.productos } } });
  await prisma.comboComponente.deleteMany({ where: { OR: [{ comboId: { in: c.productos } }, { productoId: { in: c.productos } }] } });
  await prisma.productoAdicion.deleteMany({ where: { OR: [{ productoId: { in: c.productos } }, { adicionId: { in: c.adiciones } }] } });
  await prisma.recetaItem.deleteMany({ where: { OR: [{ productoId: { in: c.productos } }, { insumoId: { in: c.insumos } }] } });
  await prisma.adicionInsumo.deleteMany({ where: { OR: [{ adicionId: { in: c.adiciones } }, { insumoId: { in: c.insumos } }] } });
  await prisma.movimientoInsumo.deleteMany({ where: { insumoId: { in: c.insumos } } });
  await prisma.insumo.deleteMany({ where: { id: { in: c.insumos } } });
  await prisma.adicion.deleteMany({ where: { id: { in: c.adiciones } } });
  await prisma.promocion.deleteMany({ where: { id: { in: c.promociones } } });
  await prisma.producto.deleteMany({ where: { id: { in: c.productos } } });
  await prisma.user.deleteMany({ where: { id: { in: c.usuarios } } });
}
