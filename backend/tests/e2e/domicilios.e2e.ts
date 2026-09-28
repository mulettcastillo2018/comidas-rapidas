import { prisma } from "../../src/lib/prisma";
import { ejecutarLimpieza } from "../../src/services/limpieza";
import { conectar, esperar, exigir, login, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Domicilios con mensajero propio (cobro al entregar, vueltas, no entregado)
// y pedidos de apps con su comisión.
export async function probarDomicilios() {
  const creados = registroDeCreados("E2E-L-");
  creados.textos.push("E2E-L");
  try {
    const t = await sesiones();
    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const crearProducto = async (nombre: string, precio: number, costo: number, requiereCocina: boolean) => {
      const p = exigir(await req("POST", "/productos", { nombre: `E2E-L ${nombre}`, descripcion: "prueba", precio, costo, tiempoPreparacionMinutos: 5, categoriaId, requiereCocina }, t.admin), "Crear producto");
      creados.productos.push(p.id);
      return p;
    };
    const hamburguesa = await crearProducto("Hamburguesa", 20000, 8000, true);
    const gaseosa = await crearProducto("Gaseosa", 4000, 1500, false);
    const items = [{ productoId: hamburguesa.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }];
    const cliente = { nombreCliente: "Cliente E2E-L", telefonoCliente: "3001234567", direccion: "Calle E2E-L # 1-2", barrio: "Centro", aceptaDatos: true };
    const nuevo = async (datos: object) => {
      const pedido = exigir(await req("POST", "/domicilios", datos, t.admin), "Crear domicilio");
      creados.pedidos.push(pedido.id);
      return pedido;
    };
    const cocinar = async (pedidoId: string) => {
      const pedido = (await req("GET", "/domicilios/activos", undefined, t.admin)).data.find((p: { id: string }) => p.id === pedidoId);
      for (const item of pedido.items.filter((i: { estado: string }) => i.estado === "RECIBIDO")) {
        await req("PUT", `/pedidos/${pedidoId}/items/${item.id}/estado`, { estado: "EN_PREPARACION" }, t.cocina);
        await req("PUT", `/pedidos/${pedidoId}/items/${item.id}/estado`, { estado: "LISTO" }, t.cocina);
      }
    };

    console.log("[domicilios] Apps de domicilios");
    verificar((await req("POST", "/plataformas", { nombre: "E2E-L Mala", comisionPct: 70 }, t.admin)).status === 400, "una comisión fuera de rango se rechaza");
    const app = exigir(await req("POST", "/plataformas", { nombre: "E2E-L App", comisionPct: 20 }, t.admin), "Crear app");
    creados.plataformas.push(app.id);
    verificar((await req("POST", "/plataformas", { nombre: "E2E-L App", comisionPct: 10 }, t.admin)).status === 409, "no se repite el nombre de una app");
    verificar((await req("GET", "/plataformas", undefined, t.mesero)).status === 403, "solo el admin configura las apps");

    console.log("\n[domicilios] La pantalla pública no recibe datos personales");
    const emailPantalla = `pantalla_${Date.now()}@comidasrapidas.test`;
    const pantalla = exigir(
      await req("POST", "/usuarios", { nombre: "Pantalla", apellido: "E2E", email: emailPantalla, password: process.env.E2E_PASSWORD, role: "PANTALLA" }, t.admin),
      "Crear pantalla"
    );
    creados.usuarios.push(pantalla.id);
    const [socketPantalla, socketCocina] = await Promise.all([conectar(await login(emailPantalla)), conectar(t.cocina)]);
    const llegados = { pantalla: [] as Record<string, unknown>[], cocina: [] as Record<string, unknown>[] };
    socketPantalla.on("pedido:nuevo", (p: Record<string, unknown>) => llegados.pantalla.push(p));
    socketCocina.on("pedido:nuevo", (p: Record<string, unknown>) => llegados.cocina.push(p));
    const conDatos = await nuevo({ canal: "DOMICILIO", ...cliente, envio: 0, metodoPago: "NEQUI", items: [{ productoId: gaseosa.id, cantidad: 1 }] });
    // El tiempo de espera cuenta desde que el pedido existe, no desde antes
    // (con la base ocupada, crearlo puede tardar unos segundos).
    const buscar = (lista: Record<string, unknown>[]) => lista.find((p) => p.id === conDatos.id) ?? null;
    for (let i = 0; i < 50 && (!buscar(llegados.pantalla) || !buscar(llegados.cocina)); i++) await esperar(100);
    const [pp, pc] = [buscar(llegados.pantalla), buscar(llegados.cocina)];
    verificar(
      pp !== null && !("telefonoCliente" in pp) && pc?.telefonoCliente === "3001234567",
      `la pantalla recibe el pedido sin el teléfono; cocina sí lo ve (eventos: pantalla ${llegados.pantalla.length}, cocina ${llegados.cocina.length})`
    );
    verificar(pp !== null && !("domicilio" in pp) && !("factura" in pp), "ni la dirección ni la cuenta viajan por el canal en vivo");
    const activosPantalla = (await req("GET", "/pedidos/activos", undefined, await login(emailPantalla))).data;
    verificar(Array.isArray(activosPantalla) && activosPantalla.every((p: object) => !("telefonoCliente" in p)), "tampoco al cargar la lista");
    socketPantalla.disconnect();
    socketCocina.disconnect();

    console.log("\n[domicilios] Domicilio que paga al recibir");
    verificar((await req("POST", "/domicilios", { canal: "DOMICILIO", ...cliente, envio: 4000, items }, t.mesero)).status === 403, "un mesero no registra domicilios");
    const sinAutorizacion = await req("POST", "/domicilios", { canal: "DOMICILIO", ...cliente, aceptaDatos: false, envio: 4000, items }, t.admin);
    verificar(sinAutorizacion.status === 400, "sin la autorización de datos del cliente no se registra");
    const noAlcanza = await req("POST", "/domicilios", { canal: "DOMICILIO", ...cliente, envio: 4000, pagaCon: 10000, items }, t.admin);
    verificar(noAlcanza.status === 400 && /no alcanza/.test(noAlcanza.data?.error), `pagar con menos del total se avisa: "${noAlcanza.data?.error}"`);
    const dom = await nuevo({ canal: "DOMICILIO", ...cliente, envio: 4000, pagaCon: 50000, items });
    verificar(dom.canal === "DOMICILIO" && dom.items.every((i: { paraLlevar: boolean }) => i.paraLlevar), "llega a cocina como domicilio, todo para empacar");
    verificar(dom.factura?.estado === "PENDIENTE" && dom.factura.total === 28000 && dom.factura.envioMonto === 4000, `cuenta pendiente de 28.000 con el domicilio (${dom.factura?.total})`);
    verificar(dom.domicilio?.pagaCon === 50000 && dom.domicilio.estado === "PENDIENTE", "guarda con qué billete paga");
    verificar((await req("PUT", `/domicilios/${dom.id}/despachar`, { domiciliario: "E2E-L Pedro" }, t.admin)).status === 409, "no sale mientras haya algo en cocina");
    await cocinar(dom.id);
    const enCamino = exigir(await req("PUT", `/domicilios/${dom.id}/despachar`, { domiciliario: "E2E-L Pedro" }, t.admin), "Despachar");
    verificar(enCamino.estado === "ENTREGADO" && enCamino.domicilio.estado === "EN_CAMINO" && enCamino.domicilio.domiciliario === "E2E-L Pedro", "sale con el mensajero: queda en camino");
    verificar((await req("GET", "/domicilios/activos", undefined, t.admin)).data.some((p: { id: string }) => p.id === dom.id), "sigue en la lista mientras va en camino");
    verificar((await req("GET", "/domicilios/domiciliarios", undefined, t.admin)).data.includes("E2E-L Pedro"), "el mensajero queda sugerido para la próxima");
    verificar((await req("PUT", `/domicilios/${dom.id}/entregado`, {}, t.admin)).status === 400, "al entregar hay que registrar el cobro");
    const mal = await req("PUT", `/domicilios/${dom.id}/entregado`, { cobro: { pagos: [{ metodo: "EFECTIVO", monto: 20000 }] } }, t.admin);
    verificar(mal.status === 400, "pagos que no suman el total se rechazan");
    const entregado = exigir(
      await req("PUT", `/domicilios/${dom.id}/entregado`, { cobro: { pagos: [{ metodo: "EFECTIVO", monto: 20000 }, { metodo: "NEQUI", monto: 8000 }] } }, t.admin),
      "Entregar"
    );
    verificar(entregado.domicilio.estado === "ENTREGADO" && entregado.factura.estado === "PAGADA" && entregado.factura.pagos.length === 2, "entregado y cobrado (efectivo + Nequi)");
    verificar(!(await req("GET", "/domicilios/activos", undefined, t.admin)).data.some((p: { id: string }) => p.id === dom.id), "sale de la lista al entregarse");

    console.log("\n[domicilios] Ya pagado, no entregado y apps");
    const prepagado = await nuevo({ canal: "DOMICILIO", ...cliente, envio: 4000, metodoPago: "TRANSFERENCIA", items });
    verificar(prepagado.factura.estado === "PAGADA" && prepagado.factura.metodoPago === "TRANSFERENCIA", "si ya pagó, la cuenta nace pagada");
    const fallido = await nuevo({ canal: "DOMICILIO", ...cliente, envio: 3000, items: [{ productoId: gaseosa.id, cantidad: 2 }] });
    exigir(await req("PUT", `/domicilios/${fallido.id}/despachar`, { domiciliario: "E2E-L Pedro" }, t.admin), "Despachar el que falla");
    verificar((await req("PUT", `/domicilios/${fallido.id}/fallido`, { motivo: "" }, t.admin)).status === 400, "no entregado pide el motivo");
    const perdido = exigir(await req("PUT", `/domicilios/${fallido.id}/fallido`, { motivo: "E2E-L no contestó" }, t.admin), "No entregado");
    verificar(perdido.domicilio.estado === "FALLIDO" && perdido.factura.estado === "PERDIDA", "no entregado: la cuenta queda como pérdida");

    verificar((await req("POST", "/domicilios", { canal: "PLATAFORMA", plataformaId: "no-existe", items }, t.admin)).status === 400, "una app que no existe se rechaza");
    const deApp = await nuevo({ canal: "PLATAFORMA", plataformaId: app.id, codigoPlataforma: "E2E-L-123", nombreCliente: "Cliente E2E-L", items });
    verificar(deApp.plataforma?.nombre === "E2E-L App" && deApp.codigoPlataforma === "E2E-L-123", "el pedido de la app lleva su nombre y número de orden");
    verificar(deApp.factura.estado === "PAGADA" && deApp.factura.metodoPago === "PLATAFORMA" && deApp.factura.comisionMonto === 4800, `la app ya cobró; comisión 20% de 24.000 = ${deApp.factura.comisionMonto}`);
    await cocinar(deApp.id);
    const recogido = exigir(await req("PUT", `/domicilios/${deApp.id}/despachar`, {}, t.admin), "Entregar al repartidor");
    verificar(recogido.estado === "ENTREGADO" && !recogido.domicilio, "con el repartidor de la app, termina");
    verificar((await req("GET", "/pedidos/activos", undefined, t.admin)).data.every((p: { id: string }) => p.id !== deApp.id), "ya no aparece en cocina ni en pantalla");

    console.log("\n[domicilios] Caja y reportes");
    const caja = (await req("GET", "/caja/actual", undefined, t.admin)).data;
    verificar(caja.totalPlataforma >= 24000, "la caja separa lo vendido por apps (no es efectivo)");
    await prisma.factura.updateMany({ where: { pedidoId: { in: creados.pedidos } }, data: { pagadaEn: new Date("2020-04-08T20:00:00-05:00") } });
    const r = (await req("GET", "/reportes/ventas?desde=2020-04-08&hasta=2020-04-08", undefined, t.admin)).data;
    verificar(r.porCanal.DOMICILIO?.cuentas === 3 && r.porCanal.PLATAFORMA?.cuentas === 1, `ventas por canal: ${r.porCanal.DOMICILIO?.cuentas} domicilios, ${r.porCanal.PLATAFORMA?.cuentas} de apps`);
    verificar(r.resumen.envios === 8000 && r.resumen.comisiones === 4800, `domicilios cobrados ${r.resumen.envios}, comisiones ${r.resumen.comisiones}`);
    const g = r.resumen.ganancia;
    verificar(g.comisiones === 4800 && g.gananciaBruta === g.ventasConCosto - g.costoVentas - g.descuentos - g.comisiones, "la comisión de la app se resta de la ganancia");
    verificar(r.cuentas.some((c: { ubicacion: string }) => c.ubicacion.includes("E2E-L App #E2E-L-123")), "el reporte dice de qué app y qué orden");

    console.log("\n[domicilios] Datos personales (Ley 1581)");
    await prisma.pedido.update({ where: { id: dom.id }, data: { creadoEn: new Date(Date.now() - 31 * 86_400_000) } });
    await ejecutarLimpieza();
    const viejo = await prisma.pedido.findUnique({ where: { id: dom.id }, include: { domicilio: true } });
    verificar(viejo?.telefonoCliente === null && viejo.domicilio?.direccion === null && viejo.domicilio.indicaciones === null, "a los 30 días se borran teléfono y dirección");
    verificar(viejo?.nombreCliente === "Cliente E2E-L", "el nombre se conserva (identifica la venta)");
  } finally {
    await limpiar(creados);
  }
}
