import { prisma } from "../../src/lib/prisma";
import { despachar, exigir, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

const hora = (iso: string) => new Date(iso);

// Costo y ganancia, métodos de pago nuevos y pagos divididos, movimientos de
// caja y cuadre del efectivo que cobran los meseros.
export async function probarDinero() {
  const creados = registroDeCreados("E2E-G-");
  creados.textos.push("Cliente E2E-G");
  try {
    const t = await sesiones();
    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const crearProducto = async (nombre: string, precio: number, costo: number | null, requiereCocina = true) => {
      const p = (await req("POST", "/productos", { nombre: `E2E-G ${nombre}`, descripcion: "prueba", precio, tiempoPreparacionMinutos: 5, categoriaId, requiereCocina, costo }, t.admin)).data;
      creados.productos.push(p.id);
      return p;
    };
    const hamburguesa = await crearProducto("Hamburguesa", 20000, 8000);
    const gaseosa = await crearProducto("Gaseosa", 4000, 1500, false);
    const sinCosto = await crearProducto("Salsa", 1000, null, false);

    console.log("[dinero] El costo solo lo ve el admin");
    const paraMesero = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { id: string }) => p.id === hamburguesa.id);
    const paraAdmin = (await req("GET", "/productos", undefined, t.admin)).data.find((p: { id: string }) => p.id === hamburguesa.id);
    verificar(paraAdmin?.costo === 8000 && !("costo" in paraMesero), "el admin lo ve; el mesero no");
    const carta = (await req("GET", "/carta")).data;
    verificar(!JSON.stringify(carta).includes('"costo"'), "la carta pública no expone costos");
    const agotar = await req("PUT", `/productos/${gaseosa.id}/disponible`, { disponible: true }, t.cocina);
    verificar(agotar.status === 200 && !("costo" in agotar.data), "cocina no lo ve al marcar disponibilidad");

    console.log("\n[dinero] Venta con pago dividido");
    const mesa = (await req("POST", "/mesas", { numero: "E2E-G-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const sesion = (await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero)).data;
    const pedido = (await req("POST", "/pedidos", {
      mesaSesionId: sesion.id,
      items: [{ productoId: hamburguesa.id, cantidad: 2 }, { productoId: gaseosa.id, cantidad: 1 }, { productoId: sinCosto.id, cantidad: 1 }],
    }, t.mesero)).data;
    verificar(!JSON.stringify(pedido).includes("costo"), "el pedido que ven meseros y cocina no trae costos");
    const guardados = await prisma.pedidoItem.findMany({ where: { pedidoId: pedido.id } });
    verificar(guardados.find((i) => i.productoId === hamburguesa.id)?.costoUnitario === 8000, "el costo queda guardado en la venta");
    await despachar(pedido.id, { cocina: t.cocina, entrega: t.mesero });
    const factura = (await req("POST", "/facturas", { mesaSesionId: sesion.id }, t.mesero)).data;
    verificar(factura.total === 45000, `total ${factura.total}`);
    const malSumado = await req("PUT", `/facturas/${factura.id}/pagar`, { pagos: [{ metodo: "EFECTIVO", monto: 20000 }, { metodo: "NEQUI", monto: 1000 }] }, t.mesero);
    verificar(malSumado.status === 400, `pagos que no suman el total → 400 "${malSumado.data?.error}"`);
    const pagada = await req("PUT", `/facturas/${factura.id}/pagar`, { pagos: [{ metodo: "EFECTIVO", monto: 20000 }, { metodo: "NEQUI", monto: 25000 }] }, t.mesero);
    verificar(pagada.status === 200 && pagada.data.metodoPago === null, "pagada con dos métodos");
    verificar((await prisma.pagoFactura.count({ where: { facturaId: factura.id } })) === 2, "quedan los dos pagos registrados");

    console.log("\n[dinero] Mostrador pagado por partes");
    const sol = (await req("POST", "/solicitudes", {
      mesaId: null, nombreCliente: "Cliente E2E-G", telefonoCliente: "3000000000", aceptaDatos: true, items: [{ productoId: gaseosa.id, cantidad: 2 }],
    })).data;
    creados.solicitudes.push(sol.id);
    const malMostrador = await req("PUT", `/solicitudes/${sol.id}/confirmar-recogida`, { pagos: [{ metodo: "TARJETA", monto: 1 }] }, t.admin);
    verificar(malMostrador.status === 400 && (await prisma.solicitudPedido.findUnique({ where: { id: sol.id } }))?.estado === "PENDIENTE", "mal sumado: se rechaza y el pedido sigue esperando en caja");
    const cobro = exigir(
      await req("PUT", `/solicitudes/${sol.id}/confirmar-recogida`, { pagos: [{ metodo: "TARJETA", monto: 5000 }, { metodo: "DAVIPLATA", monto: 3000 }] }, t.admin),
      "Cobrar en caja por partes"
    );
    creados.pedidos.push(cobro.pedido.id);
    verificar((await prisma.pagoFactura.count({ where: { facturaId: cobro.factura.id } })) === 2, "cobro de mostrador con tarjeta + Daviplata");
    await despachar(cobro.pedido.id, { cocina: t.cocina, entrega: t.admin });

    console.log("\n[dinero] Reporte: métodos, ganancia y clasificación de la carta");
    await prisma.factura.updateMany({ where: { id: { in: [factura.id, cobro.factura.id] } }, data: { pagadaEn: hora("2020-02-10T13:00:00-05:00") } });
    const r = (await req("GET", "/reportes/ventas?desde=2020-02-10&hasta=2020-02-10", undefined, t.admin)).data;
    const metodo = (m: string) => r.porMetodo.find((x: { metodo: string }) => x.metodo === m)?.ventas;
    verificar(metodo("EFECTIVO") === 20000 && metodo("NEQUI") === 25000 && metodo("TARJETA") === 5000 && metodo("DAVIPLATA") === 3000, "cada método suma su parte");
    const g = r.resumen.ganancia;
    // Con costo: 2 hamburguesas (40.000 − 16.000) + 3 gaseosas (12.000 − 4.500).
    verificar(g.ventasConCosto === 52000 && g.costoVentas === 20500 && g.gananciaBruta === 31500, `ganancia ${g.gananciaBruta} sobre ${g.ventasConCosto}`);
    verificar(g.productosSinCosto.includes("E2E-G Salsa"), "avisa qué productos no tienen costo");
    const clasificados = r.porProducto.filter((p: { clasificacion: string | null }) => p.clasificacion);
    verificar(clasificados.length === 2, `los productos con costo quedan clasificados (${clasificados.map((p: { clasificacion: string }) => p.clasificacion).join(", ")})`);

    console.log("\n[dinero] Movimientos de caja y cuadre por mesero");
    const mov = async (body: object) => {
      const r = await req("POST", "/caja/movimientos", body, t.admin);
      if (r.status === 201) creados.movimientosCaja.push(r.data.id);
      return r;
    };
    verificar((await mov({ tipo: "SALIDA", monto: 5000 })).status === 400, "una salida sin concepto se rechaza");
    verificar((await mov({ tipo: "ENTREGA_MESERO", monto: 5000 })).status === 400, "una entrega sin mesero se rechaza");
    verificar((await req("POST", "/caja/movimientos", { tipo: "SALIDA", monto: 1, concepto: "x" }, t.mesero)).status === 403, "un mesero no registra movimientos");
    await mov({ tipo: "SALIDA", monto: 5000, concepto: "E2E pago del pan" });
    await mov({ tipo: "ENTRADA", monto: 2000, concepto: "E2E más base" });
    await mov({ tipo: "ENTREGA_MESERO", monto: 15000, meseroId: t.meseroId });
    const borrable = (await mov({ tipo: "SALIDA", monto: 999, concepto: "E2E error de digitación" })).data;
    verificar((await req("DELETE", `/caja/movimientos/${borrable.id}`, undefined, t.admin)).status === 204, "un movimiento mal digitado se puede borrar");

    const actual = (await req("GET", "/caja/actual", undefined, t.admin)).data;
    const cuadre = actual.porMesero.find((m: { userId: string }) => m.userId === t.meseroId);
    verificar(cuadre && cuadre.cobrado >= 20000 && cuadre.entregado >= 15000 && cuadre.pendiente === cuadre.cobrado - cuadre.entregado, `cuadre del mesero: cobró ${cuadre?.cobrado}, entregó ${cuadre?.entregado}`);
    verificar(actual.totalEntradas >= 2000 && actual.totalSalidas >= 5000, "entradas y salidas en el turno");
    const esperado = 50000 + actual.totalEfectivo + actual.totalEntradas - actual.totalSalidas;
    const cierre = await req("POST", "/caja/cierres", { baseInicial: 50000, efectivoContado: esperado }, t.admin);
    if (cierre.status === 201) creados.cierres.push(cierre.data.id);
    verificar(cierre.status === 201 && cierre.data.diferencia === 0, `cuadra con base + efectivo + entradas − salidas (diferencia ${cierre.data?.diferencia})`);
    verificar(cierre.data.totalNequi >= 25000 && cierre.data.totalDaviplata >= 3000, "el cierre guarda Nequi y Daviplata");
    const enCierre = await prisma.movimientoCaja.count({ where: { id: { in: creados.movimientosCaja }, cierreCajaId: cierre.data.id } });
    verificar(enCierre === 3, `los movimientos quedaron en el cierre (${enCierre})`);
    verificar((await req("DELETE", `/caja/movimientos/${creados.movimientosCaja[0]}`, undefined, t.admin)).status === 409, "ya cerrado, no se puede borrar");
  } finally {
    await limpiar(creados);
  }
}
