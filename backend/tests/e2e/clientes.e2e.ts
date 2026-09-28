import { prisma } from "../../src/lib/prisma";
import { despachar, esperar, exigir, req, sesiones, supervisorDePrueba, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Programa de puntos: registro con autorización de datos, acumulación en
// mesa, mostrador y domicilio, canje como descuento, devolución si la cuenta
// no se paga y borrado de datos.
export async function probarClientes() {
  const creados = registroDeCreados("E2E-Q-");
  creados.textos.push("E2E-Q");
  const t = await sesiones();
  const original = await prisma.configuracion.findUnique({ where: { id: "unica" } });
  try {
    exigir(
      await req("PUT", "/configuracion", { propinaPctCocina: original?.propinaPctCocina ?? 0, propinaModo: original?.propinaModo ?? "PROPIAS", puntosActivo: true, pesosPorPunto: 1000, valorPunto: 10, minimoCanje: 50 }, t.admin),
      "Activar puntos"
    );
    const puntosDe = async (id: string) => (await prisma.cliente.findUniqueOrThrow({ where: { id } })).puntos;
    // Los puntos se acreditan justo después del cobro.
    const esperarPuntos = async (id: string, esperados: number) => {
      for (let i = 0; i < 15 && (await puntosDe(id)) !== esperados; i++) await esperar(300);
      return puntosDe(id);
    };

    console.log("[clientes] Registro");
    const programa = (await req("GET", "/clientes/programa", undefined, t.mesero)).data;
    verificar(programa.activo && programa.valorPunto === 10, "el mesero ve que el programa está activo");
    verificar((await req("GET", "/clientes/buscar?telefono=3009990001", undefined, t.mesero)).status === 404, "celular sin registrar → no existe");
    verificar((await req("POST", "/clientes", { telefono: "3009990001", nombre: "E2E-Q Ana" }, t.mesero)).status === 400, "sin la autorización de datos no se registra");
    verificar((await req("POST", "/clientes", { telefono: "12345", nombre: "E2E-Q Ana", autoriza: true }, t.mesero)).status === 400, "un celular inválido se rechaza");
    const ana = exigir(await req("POST", "/clientes", { telefono: "+57 300 999 0001", nombre: "E2E-Q Ana", autoriza: true }, t.mesero), "Registrar");
    creados.clientes.push(ana.id);
    verificar(ana.telefono === "3009990001" && ana.puntos === 0, "se guarda el celular limpio (sin +57 ni espacios)");
    verificar((await req("POST", "/clientes", { telefono: "3009990001", nombre: "Otra", autoriza: true }, t.mesero)).status === 409, "no se repite un celular");

    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const producto = exigir(await req("POST", "/productos", { nombre: "E2E-Q Hamburguesa", descripcion: "prueba", precio: 21600, tiempoPreparacionMinutos: 5, categoriaId, requiereCocina: false }, t.admin), "Producto");
    creados.productos.push(producto.id);
    let mesas = 0;
    const cuentaDeMesa = async (cantidad: number, datosCuenta: object) => {
      mesas++;
      const mesa = exigir(await req("POST", "/mesas", { numero: `E2E-Q-${mesas}`, capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Mesa");
      const sesion = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir");
      const pedido = exigir(await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: producto.id, cantidad }] }, t.mesero), "Pedido");
      await despachar(pedido.id, { cocina: t.cocina, entrega: t.mesero });
      return req("POST", "/facturas", { mesaSesionId: sesion.id, ...datosCuenta }, t.mesero);
    };

    console.log("\n[clientes] Acumular y canjear en la mesa");
    const c1 = exigir(await cuentaDeMesa(2, { propinaMonto: 4000, cliente: { clienteId: ana.id } }), "Cuenta 1");
    exigir(await req("PUT", `/facturas/${c1.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero), "Pagar 1");
    verificar((await esperarPuntos(ana.id, 43)) === 43, "43.200 en productos → 43 puntos (la propina no suma)");
    const anaDespues = await prisma.cliente.findUniqueOrThrow({ where: { id: ana.id } });
    verificar(anaDespues.visitas === 1 && anaDespues.totalGastado === 43200, "cuenta la visita y lo que compró");

    const sinPuntos = await cuentaDeMesa(3, { cliente: { clienteId: ana.id, canjearPuntos: 50 } });
    verificar(sinPuntos.status === 409, "no se canjean más puntos de los que tiene");
    exigir(await req("POST", `/clientes/${ana.id}/ajuste`, { puntos: 20, nota: "E2E-Q bienvenida" }, t.admin), "Ajuste");
    const sesion2 = await prisma.mesaSesion.findFirstOrThrow({ where: { mesa: { numero: `E2E-Q-${mesas}` } } });
    const c2 = exigir(await req("POST", "/facturas", { mesaSesionId: sesion2.id, cliente: { clienteId: ana.id, canjearPuntos: 60 } }, t.mesero), "Cuenta con canje");
    verificar(c2.descuentoMonto === 600 && c2.total === 64800 - 600 && c2.puntosCanjeados === 60, "canjear 60 puntos descuenta $600, sin clave de supervisor");
    verificar((await puntosDe(ana.id)) === 3, "y se descuentan de sus puntos");
    exigir(await req("PUT", `/facturas/${c2.id}/pagar`, { metodoPago: "NEQUI" }, t.mesero), "Pagar 2");
    verificar((await esperarPuntos(ana.id, 67)) === 67, "al pagar gana sobre lo que pagó (64.200 → 64 puntos)");

    const c3 = exigir(await cuentaDeMesa(1, { cliente: { clienteId: ana.id, canjearPuntos: 50 } }), "Cuenta 3");
    verificar((await puntosDe(ana.id)) === 17, "canjea 50 más");
    const supervisor = await supervisorDePrueba(t.admin, creados);
    exigir(await req("PUT", `/facturas/${c3.id}/marcar-perdida`, { pin: supervisor.pin }, t.mesero), "Se fue sin pagar");
    verificar((await esperarPuntos(ana.id, 67)) === 67, "si se va sin pagar, los puntos canjeados le vuelven");

    console.log("\n[clientes] Mostrador y domicilio");
    const sol = exigir(
      await req("POST", "/solicitudes", { mesaId: null, nombreCliente: "Cliente E2E-Q", telefonoCliente: "3009990001", aceptaDatos: true, items: [{ productoId: producto.id, cantidad: 1 }] }),
      "Solicitud"
    );
    creados.solicitudes.push(sol.id);
    const confirmada = exigir(await req("PUT", `/solicitudes/${sol.id}/confirmar-recogida`, { metodoPago: "EFECTIVO", clienteId: ana.id }, t.admin), "Confirmar mostrador");
    creados.pedidos.push(confirmada.pedido.id);
    verificar((await esperarPuntos(ana.id, 88)) === 88, "en caja también acumula (21 puntos)");
    const dom = exigir(
      await req("POST", "/domicilios", { canal: "DOMICILIO", nombreCliente: "Ana E2E-Q", telefonoCliente: "300-999-0001", direccion: "Calle E2E-Q", envio: 4000, aceptaDatos: true, metodoPago: "NEQUI", items: [{ productoId: producto.id, cantidad: 1 }] }, t.admin),
      "Domicilio"
    );
    creados.pedidos.push(dom.id);
    verificar(dom.factura.clienteId === ana.id, "un domicilio con el celular de un cliente queda a su nombre solo");
    verificar((await esperarPuntos(ana.id, 109)) === 109, "y acumula por los productos, no por el domicilio");

    console.log("\n[clientes] Admin y datos personales");
    const lista = (await req("GET", "/clientes?buscar=999000", undefined, t.admin)).data;
    verificar(lista.clientes.some((c: { id: string }) => c.id === ana.id) && lista.resumen.puntosPendientes >= 109, "el admin lo encuentra por parte del celular y ve los puntos pendientes");
    verificar((await req("GET", "/clientes", undefined, t.mesero)).status === 403, "la lista de clientes es solo del admin");
    const movs = (await req("GET", `/clientes/${ana.id}/movimientos`, undefined, t.admin)).data;
    verificar(["ACUMULADO", "CANJE", "DEVOLUCION", "AJUSTE"].every((tipo) => movs.some((m: { tipo: string }) => m.tipo === tipo)), "queda el historial de sus puntos");
    exigir(await req("DELETE", `/clientes/${ana.id}`, undefined, t.admin), "Borrar datos");
    const borrado = await prisma.cliente.findUniqueOrThrow({ where: { id: ana.id } });
    verificar(borrado.nombre === "Cliente eliminado" && !borrado.telefono.startsWith("3") && borrado.email === null, "al pedir el borrado, se quitan nombre y celular");
    verificar((await req("GET", "/clientes/buscar?telefono=3009990001", undefined, t.mesero)).status === 404, "y ya no aparece al buscarlo");
    verificar((await prisma.factura.count({ where: { clienteId: ana.id } })) >= 4, "sus compras siguen en las ventas, sin datos personales");
  } finally {
    if (original) {
      const { id: _id, ...datos } = original;
      await prisma.configuracion.update({ where: { id: "unica" }, data: datos });
    }
    await limpiar(creados);
  }
}
