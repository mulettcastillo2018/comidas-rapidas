import { prisma } from "../../src/lib/prisma";
import { despachar, estados, exigir, login, req, sesiones, supervisorDePrueba, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Clave de supervisor para lo que un mesero no debe hacer solo, e inventario
// por unidades que se descuenta con cada venta.
export async function probarControl() {
  const creados = registroDeCreados("E2E-H-");
  try {
    const t = await sesiones();
    const adminId: string = (await req("GET", "/auth/me", undefined, t.admin)).data.id;
    const deCocina = (await req("GET", "/productos", undefined, t.mesero)).data.filter((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const crearMesa = async (n: string) =>
      exigir(await req("POST", "/mesas", { numero: `E2E-H-${n}`, capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Crear mesa");
    const abrir = async (mesaId: string) =>
      exigir(await req("POST", "/mesa-sesiones", { mesaId, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir mesa");
    const pedir = async (sesionId: string, items: object[]) => req("POST", "/pedidos", { mesaSesionId: sesionId, items }, t.mesero);

    console.log("[control] Clave de supervisor");
    const supervisor = await supervisorDePrueba(t.admin, creados);
    verificar((await req("PUT", "/usuarios/me/pin", { pin: "12" }, supervisor.token)).status === 400, "una clave de 2 números se rechaza");
    verificar((await req("PUT", "/usuarios/me/pin", { pin: "1234" }, t.mesero)).status === 403, "un mesero no puede tener clave de supervisor");
    const otroAdmin = await supervisorDePrueba(t.admin, creados);
    const repetida = await req("PUT", "/usuarios/me/pin", { pin: supervisor.pin }, otroAdmin.token);
    verificar(repetida.status === 409, "dos admins no pueden tener la misma clave");
    const lista = (await req("GET", "/usuarios", undefined, t.admin)).data;
    const enLista = lista.find((u: { id: string }) => u.id === supervisor.id);
    verificar(enLista?.tienePin === true && !JSON.stringify(lista).includes("pinHash"), "la lista dice quién tiene clave, sin exponerla");

    console.log("\n[control] Registrar que el cliente se fue sin pagar");
    const sesion1 = await abrir((await crearMesa("1")).id);
    const p1 = exigir(await pedir(sesion1.id, [{ productoId: deCocina[0].id, cantidad: 1 }]), "Pedido");
    await despachar(p1.id, { cocina: t.cocina, entrega: t.mesero });
    const factura = exigir(await req("POST", "/facturas", { mesaSesionId: sesion1.id }, t.mesero), "Generar cuenta");
    const sinClave = await req("PUT", `/facturas/${factura.id}/marcar-perdida`, {}, t.mesero);
    verificar(sinClave.status === 428, `sin clave → 428 "${sinClave.data?.error}"`);
    verificar((await req("PUT", `/facturas/${factura.id}/marcar-perdida`, { pin: "000000" }, t.mesero)).status === 403, "clave incorrecta → 403");
    const conClave = await req("PUT", `/facturas/${factura.id}/marcar-perdida`, { pin: supervisor.pin }, t.mesero);
    verificar(conClave.status === 200, "con la clave de un admin → se registra");
    verificar((await prisma.factura.findUnique({ where: { id: factura.id } }))?.autorizadaPorId === supervisor.id, "queda registrado quién autorizó");
    const aviso = await prisma.notificacion.findFirst({ where: { userId: adminId, tipo: "AUTORIZACION", mensaje: { contains: "E2E-H-1" } } });
    verificar(Boolean(aviso) && aviso!.enlace === `/mesero/mesa/${sesion1.id}`, "los demás admins reciben el aviso con enlace a la mesa");
    verificar((await prisma.notificacion.count({ where: { userId: supervisor.id, tipo: "AUTORIZACION" } })) === 0, "al que digitó la clave no se le avisa (estaba ahí)");

    console.log("\n[control] Cancelar algo que cocina ya empezó");
    const sesion2 = await abrir((await crearMesa("2")).id);
    const p2 = exigir(await pedir(sesion2.id, [{ productoId: deCocina[0].id, cantidad: 1 }, { productoId: deCocina[1].id, cantidad: 1 }, { productoId: deCocina[2].id, cantidad: 1 }]), "Pedido");
    const [enEspera, enCocina, otroEnCocina] = p2.items;
    const item = (id: string, body: object, token: string) => req("PUT", `/pedidos/${p2.id}/items/${id}/estado`, body, token);
    verificar((await item(enEspera.id, { estado: "CANCELADO" }, t.mesero)).status === 200, "lo que cocina no ha empezado se cancela sin clave");
    await item(enCocina.id, { estado: "EN_PREPARACION" }, t.cocina);
    await item(otroEnCocina.id, { estado: "EN_PREPARACION" }, t.cocina);
    verificar((await item(enCocina.id, { estado: "CANCELADO" }, t.mesero)).status === 428, "lo que ya está en preparación pide clave");
    verificar((await item(enCocina.id, { estado: "CANCELADO", pin: supervisor.pin }, t.mesero)).status === 200, "con clave se cancela");
    const log = await prisma.pedidoItemStatusLog.findFirst({ where: { pedidoItemId: enCocina.id, aEstado: "CANCELADO" } });
    verificar(log?.autorizadoPorId === supervisor.id, "la cancelación queda con quién la autorizó");
    verificar((await item(otroEnCocina.id, { estado: "CANCELADO" }, t.admin)).status === 200, "el admin cancela sin digitar clave");

    console.log("\n[control] Muchos intentos con clave incorrecta");
    const temporal = exigir(
      await req("POST", "/usuarios", { nombre: "Mesero", apellido: "E2E", email: `mesero_tmp_${Date.now()}@comidasrapidas.test`, password: process.env.E2E_PASSWORD, role: "MESERO" }, t.admin),
      "Crear mesero temporal"
    );
    creados.usuarios.push(temporal.id);
    const tokenTemporal = await login(temporal.email);
    const intentos = [];
    for (let i = 0; i < 6; i++) intentos.push((await req("PUT", "/facturas/no-existe/marcar-perdida", { pin: "999999" }, tokenTemporal)).status);
    verificar(intentos.slice(0, 5).every((s) => s === 403) && intentos[5] === 429, `tras 5 intentos fallidos se bloquea (${intentos.join(",")})`);

    console.log("\n[control] Inventario por unidades");
    const gaseosa = exigir(
      await req("POST", "/productos", { nombre: "E2E-H Gaseosa", descripcion: "prueba", precio: 3000, tiempoPreparacionMinutos: 1, categoriaId: deCocina[0].categoriaId, requiereCocina: false }, t.admin),
      "Crear producto"
    );
    creados.productos.push(gaseosa.id);
    verificar((await req("GET", "/inventario", undefined, t.mesero)).status === 403, "un mesero no ve el inventario");
    exigir(await req("POST", `/inventario/${gaseosa.id}/activar`, { stockInicial: 3, stockMinimo: 1 }, t.admin), "Activar inventario");
    // El inventario es de la sede (la principal: la del admin general sin elegir otra).
    const stock = async () => prisma.productoSede.findFirstOrThrow({ where: { productoId: gaseosa.id, sede: { esPrincipal: true } } });
    const sesion3 = await abrir((await crearMesa("3")).id);

    exigir(await pedir(sesion3.id, [{ productoId: gaseosa.id, cantidad: 2 }]), "Vender 2");
    verificar((await stock()).stock === 1, "vender 2 de 3 deja 1");
    const bajo = await prisma.notificacion.findFirst({ where: { userId: adminId, tipo: "STOCK", mensaje: { contains: "Quedan 1 de E2E-H Gaseosa" } } });
    verificar(bajo?.enlace === "/admin/inventario", "aviso de inventario bajo al admin");
    const deMas = await pedir(sesion3.id, [{ productoId: gaseosa.id, cantidad: 2 }]);
    verificar(deMas.status === 409 && /Solo quedan 1/.test(deMas.data?.error), `pedir más de lo que hay → 409 "${deMas.data?.error}"`);
    const ultima = exigir(await pedir(sesion3.id, [{ productoId: gaseosa.id, cantidad: 1 }]), "Vender la última");
    const agotada = await stock();
    verificar(agotada.stock === 0 && !agotada.disponible && agotada.agotadoPorStock, "al llegar a cero se agota sola");
    verificar(Boolean(await prisma.notificacion.findFirst({ where: { userId: adminId, tipo: "STOCK", mensaje: { contains: "Se agotó E2E-H Gaseosa" } } })), "aviso de agotado");
    const carta = (await req("GET", "/carta")).data;
    verificar(!JSON.stringify(carta).includes("E2E-H Gaseosa"), "sale de la carta pública");
    await req("PUT", `/pedidos/${ultima.id}/items/${ultima.items[0].id}/estado`, { estado: "CANCELADO" }, t.mesero);
    const devuelta = await stock();
    verificar(devuelta.stock === 1 && devuelta.disponible && !devuelta.agotadoPorStock, "al cancelarla vuelve al inventario y se reactiva sola");

    exigir(await req("POST", `/inventario/${gaseosa.id}/movimientos`, { tipo: "ENTRADA", cantidad: 10, nota: "proveedor" }, t.admin), "Entrada");
    verificar((await stock()).stock === 11 && !(await stock()).alertaStockBajo, "llegó mercancía: 11 y se apaga la alerta de bajo");
    exigir(await req("POST", `/inventario/${gaseosa.id}/movimientos`, { tipo: "AJUSTE", cantidad: 7, nota: "conteo" }, t.admin), "Ajuste");
    verificar((await stock()).stock === 7, "el ajuste deja exactamente lo contado");

    const simultaneos = await Promise.all([1, 2].map(() => pedir(sesion3.id, [{ productoId: gaseosa.id, cantidad: 6 }])));
    verificar(estados(simultaneos) === "201,409" && (await stock()).stock === 1, `dos pedidos de 6 con 7 en existencia: uno pasa, el otro no (${estados(simultaneos)})`);
    const historial = (await req("GET", `/inventario/${gaseosa.id}/movimientos`, undefined, t.admin)).data;
    const tipos = new Set(historial.map((m: { tipo: string }) => m.tipo));
    verificar(["VENTA", "DEVOLUCION", "ENTRADA", "AJUSTE"].every((tipo) => tipos.has(tipo)), "el historial registra ventas, devoluciones, entradas y ajustes");
    const ajuste = historial.find((m: { tipo: string; nota: string }) => m.tipo === "AJUSTE" && m.nota === "conteo");
    verificar(ajuste?.cantidad === -4, `el ajuste muestra la diferencia contada (${ajuste?.cantidad})`);

    const paraMesero = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { id: string }) => p.id === gaseosa.id);
    verificar(paraMesero?.stock === 1 && !("agotadoPorStock" in paraMesero), "el mesero ve cuántas quedan, no las banderas internas");

    exigir(await pedir(sesion3.id, [{ productoId: gaseosa.id, cantidad: 1 }]), "Vender la última otra vez");
    verificar(!(await stock()).disponible, "agotada otra vez");
    exigir(await req("POST", `/inventario/${gaseosa.id}/desactivar`, undefined, t.admin), "Desactivar");
    verificar((await stock()).disponible, "sin control de inventario vuelve a estar disponible");
  } finally {
    await limpiar(creados);
  }
}
