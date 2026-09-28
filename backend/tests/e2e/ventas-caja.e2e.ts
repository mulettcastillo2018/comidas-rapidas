import { prisma } from "../../src/lib/prisma";
import { despachar, estados, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

const hora = (iso: string) => new Date(iso);

// Reporte de ventas (aislado de los datos reales moviendo las cuentas de
// prueba a enero de 2020), cierre de caja y las correcciones de
// cancelación/carreras que afectan lo que se cobra.
export async function probarVentasYCaja() {
  const creados = registroDeCreados("E2E-C-");
  creados.textos.push("Prueba Reporte E2E");
  try {
    const t = await sesiones();
    const productos = (await req("GET", "/productos", undefined, t.mesero)).data.filter((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const [A, B, C] = productos;
    const mesa = (await req("POST", "/mesas", { numero: "E2E-C-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const abrir = async () => (await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Prueba", comensales: ["Prueba"] }, t.mesero)).data;
    const pedir = async (sesionId: string, items: object[]) => (await req("POST", "/pedidos", { mesaSesionId: sesionId, items }, t.mesero)).data;
    const item = (pedidoId: string, itemId: string, estado: string, token: string) => req("PUT", `/pedidos/${pedidoId}/items/${itemId}/estado`, { estado }, token);

    console.log("[ventas] Cancelar lo que falta de un pedido no cancela lo ya entregado");
    const sesion1 = await abrir();
    const p1 = await pedir(sesion1.id, [{ productoId: A.id, cantidad: 2 }, { productoId: B.id, cantidad: 1 }]);
    const itemA = p1.items.find((i: { productoId: string }) => i.productoId === A.id);
    const itemB = p1.items.find((i: { productoId: string }) => i.productoId === B.id);
    for (const [estado, token] of [["EN_PREPARACION", t.cocina], ["LISTO", t.cocina], ["ENTREGADO", t.mesero]]) await item(p1.id, itemA.id, estado, token);
    await item(p1.id, itemB.id, "EN_PREPARACION", t.cocina);
    const cancelar = await req("PUT", `/pedidos/${p1.id}/estado`, { estado: "CANCELADO" }, t.mesero);
    const itemsP1 = await prisma.pedidoItem.findMany({ where: { pedidoId: p1.id } });
    verificar(itemsP1.find((i) => i.id === itemA.id)?.estado === "ENTREGADO", "lo entregado sigue ENTREGADO (y se cobra)");
    verificar(itemsP1.find((i) => i.id === itemB.id)?.estado === "CANCELADO" && cancelar.data?.estado === "ENTREGADO", "lo que faltaba se cancela y el pedido queda ENTREGADO");
    verificar((await prisma.pedidoItemStatusLog.findFirst({ where: { pedidoItemId: itemB.id, aEstado: "CANCELADO" } }))?.deEstado === "EN_PREPARACION", "queda el registro por producto");
    verificar((await prisma.notificacion.count({ where: { pedidoId: p1.id, tipo: "ITEM_CANCELADO" } })) > 0, "cocina recibe el aviso");

    console.log("\n[ventas] Carreras en el mismo producto y en el mismo pedido");
    const p2 = await pedir(sesion1.id, [{ productoId: A.id, cantidad: 1 }, { productoId: C.id, cantidad: 1 }]);
    const choque = await Promise.all([item(p2.id, p2.items[0].id, "EN_PREPARACION", t.cocina), item(p2.id, p2.items[0].id, "CANCELADO", t.mesero)]);
    verificar(estados(choque) === "200,409", `cocina y mesero a la vez: uno se aplica, el otro se rechaza (${estados(choque)})`);
    for (const it of p2.items) {
      const actual = await prisma.pedidoItem.findUnique({ where: { id: it.id } });
      if (actual?.estado === "RECIBIDO") await item(p2.id, it.id, "EN_PREPARACION", t.cocina);
      if (actual?.estado !== "CANCELADO") await item(p2.id, it.id, "LISTO", t.cocina);
    }
    const listos = await prisma.pedidoItem.findMany({ where: { pedidoId: p2.id, estado: "LISTO" } });
    await Promise.all(listos.map((i) => item(p2.id, i.id, "ENTREGADO", t.mesero)));
    verificar((await prisma.pedido.findUnique({ where: { id: p2.id } }))?.estado === "ENTREGADO", "entregas simultáneas: el pedido no queda atascado en LISTO");

    console.log("\n[ventas] Cuentas: una pagada, una perdida y una de mostrador");
    const f1 = (await req("POST", "/facturas", { mesaSesionId: sesion1.id, propinaMonto: 5000 }, t.mesero)).data;
    await req("PUT", `/facturas/${f1.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero);
    const sesion2 = await abrir();
    const p3 = await pedir(sesion2.id, [{ productoId: C.id, cantidad: 1 }]);
    await despachar(p3.id, { cocina: t.cocina, entrega: t.mesero });
    const f2 = (await req("POST", "/facturas", { mesaSesionId: sesion2.id }, t.mesero)).data;
    await req("PUT", `/facturas/${f2.id}/marcar-perdida`, undefined, t.mesero);
    const sol = (await req("POST", "/solicitudes", {
      mesaId: null,
      nombreCliente: "Prueba Reporte E2E",
      telefonoCliente: "3000000000",
      aceptaDatos: true,
      items: [{ productoId: B.id, cantidad: 3 }],
    })).data;
    creados.solicitudes.push(sol.id);
    const cobro = (await req("PUT", `/solicitudes/${sol.id}/confirmar-recogida`, { metodoPago: "TARJETA" }, t.admin)).data;
    creados.pedidos.push(cobro.pedido.id);
    await despachar(cobro.pedido.id, { cocina: t.cocina, entrega: t.admin });
    const [F1, F2, F3] = await Promise.all([f1.id, f2.id, cobro.factura.id].map((id) => prisma.factura.findUniqueOrThrow({ where: { id } })));
    const cobrable = await prisma.pedidoItem.findMany({ where: { pedido: { mesaSesionId: sesion1.id }, estado: { not: "CANCELADO" } } });
    verificar(F1.subtotal === cobrable.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0), `la cuenta no cobra lo cancelado (${F1.subtotal})`);

    // A enero de 2020 para aislarlas de las ventas reales. F1 a las 9:30 p. m.
    // hora Colombia (02:30 UTC del día siguiente) debe contar como del 15.
    await prisma.factura.update({ where: { id: F1.id }, data: { pagadaEn: hora("2020-01-15T21:30:00-05:00") } });
    await prisma.factura.update({ where: { id: F2.id }, data: { pagadaEn: hora("2020-01-15T13:00:00-05:00") } });
    await prisma.factura.update({ where: { id: F3.id }, data: { pagadaEn: hora("2020-01-16T10:00:00-05:00") } });
    const pedidosPrueba = [p1.id, p2.id, p3.id, cobro.pedido.id];
    await prisma.pedidoItemStatusLog.updateMany({
      where: { pedidoItem: { pedidoId: { in: pedidosPrueba } }, aEstado: "CANCELADO" },
      data: { cambiadoEn: hora("2020-01-15T12:00:00-05:00") },
    });

    console.log("\n[ventas] Reporte 15-16 de enero de 2020");
    const r = (await req("GET", "/reportes/ventas?desde=2020-01-15&hasta=2020-01-16", undefined, t.admin)).data;
    verificar(r.resumen.ventas === F1.total + F3.total && r.resumen.cuentas === 2, `ventas = pagada + mostrador (${r.resumen.ventas})`);
    verificar(r.resumen.propinas === 5000 && r.resumen.perdidas.cuentas === 1 && r.resumen.perdidas.total === F2.total, "propina y pérdida correctas");
    const cancelados = await prisma.pedidoItem.findMany({ where: { pedidoId: { in: pedidosPrueba }, estado: "CANCELADO" } });
    verificar(r.resumen.cancelaciones.total === cancelados.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0), "valor cancelado correcto");
    const d15 = r.porDia.find((d: { dia: string }) => d.dia === "2020-01-15");
    const d16 = r.porDia.find((d: { dia: string }) => d.dia === "2020-01-16");
    verificar(r.porDia.length === 2 && d15?.ventas === F1.total && d16?.ventas === F3.total, "la venta de las 9:30 p. m. cuenta en su día local");
    verificar(r.porCanal.MESA.ventas === F1.total && r.porCanal.MOSTRADOR.ventas === F3.total, "por canal correcto");
    verificar(r.porProducto.reduce((s: number, p: { ventas: number }) => s + p.ventas, 0) === F1.subtotal + F3.subtotal, "los productos suman lo cobrado");
    verificar((await req("GET", "/reportes/ventas?desde=2020-01-16&hasta=2020-01-15", undefined, t.admin)).status === 400, "rango invertido → 400");
    verificar((await req("GET", "/reportes/ventas?desde=2020-01-15&hasta=2020-01-16", undefined, t.mesero)).status === 403, "un mesero no ve ventas (403)");

    console.log("\n[caja] Cierre de caja");
    const sinCerrar = await prisma.factura.findMany({ where: { cierreCajaId: null, estado: { in: ["PAGADA", "PERDIDA"] } } });
    const efectivo = sinCerrar.filter((f) => f.estado === "PAGADA" && f.metodoPago === "EFECTIVO").reduce((s, f) => s + f.total, 0);
    const actual = (await req("GET", "/caja/actual", undefined, t.admin)).data;
    verificar(actual.totalEfectivo === efectivo && actual.cuentasPagadas + actual.cuentasPerdidas === sinCerrar.length, "la vista previa incluye todo lo no cerrado");
    const contado = 100000 + actual.totalEfectivo - 2000;
    const cierres = await Promise.all([1, 2].map(() => req("POST", "/caja/cierres", { baseInicial: 100000, efectivoContado: contado, notas: "E2E" }, t.admin)));
    verificar(estados(cierres) === "201,409", `dos cierres simultáneos: uno pasa, el otro se rechaza (${estados(cierres)})`);
    const cierre = cierres.find((c) => c.status === 201)!.data;
    creados.cierres.push(cierre.id);
    verificar(cierre.diferencia === -2000, `faltan 2.000 (${cierre.diferencia})`);
    verificar((await prisma.factura.count({ where: { cierreCajaId: cierre.id } })) === sinCerrar.length, "todas las cuentas quedaron en ese cierre");
    verificar((await req("POST", "/caja/cierres", { baseInicial: 0, efectivoContado: 0 }, t.admin)).status === 409, "cerrar otra vez sin cobros nuevos → 409");
    verificar((await req("POST", "/caja/cierres", { baseInicial: -1, efectivoContado: "abc" }, t.admin)).status === 400, "valores inválidos → 400");
  } finally {
    await limpiar(creados);
  }
}
