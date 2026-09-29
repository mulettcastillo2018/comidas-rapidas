import { prisma } from "../../src/lib/prisma";
import { conectar, despachar, esperar, exigir, login, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Varias sedes: cada una con sus mesas, su cocina, su inventario y su caja;
// el administrador general ve cualquiera (o todas) y el de una sede, solo la
// suya.
export async function probarSedes() {
  const creados = registroDeCreados("E2E-S-");
  creados.textos.push("E2E-S");
  const sockets: Awaited<ReturnType<typeof conectar>>[] = [];
  try {
    const t = await sesiones();
    const principal = await prisma.sede.findFirstOrThrow({ where: { esPrincipal: true } });

    console.log("[sedes] Crear una sede y su personal");
    verificar((await req("POST", "/sedes", { nombre: "E2E-S Norte" }, t.mesero)).status === 403, "un mesero no crea sedes");
    const vistaMesero = exigir(await req("GET", "/sedes", undefined, t.mesero), "Sedes (mesero)");
    verificar(vistaMesero.actual === principal.id && !vistaMesero.puedeCambiar && !("posPrefijo" in vistaMesero.sedes[0]), "el mesero ve dónde trabaja, sin los datos de la caja");
    const norte = exigir(await req("POST", "/sedes", { nombre: "E2E-S Norte", direccion: "Calle 1" }, t.admin), "Crear sede");
    creados.sedes.push(norte.id);
    verificar((await req("POST", "/sedes", { nombre: "E2E-S Norte" }, t.admin)).status === 409, "no se repite el nombre de una sede");

    const cuenta = async (role: string, sufijo: string) => {
      const email = `sede_${sufijo}_${Date.now()}@comidasrapidas.test`;
      const u = exigir(await req("POST", "/usuarios", { nombre: sufijo, apellido: "E2E-S", email, password: process.env.E2E_PASSWORD, role, sedeId: norte.id }, t.admin), `Crear ${sufijo}`);
      creados.usuarios.push(u.id);
      return { id: u.id as string, email };
    };
    const meseroN = await cuenta("MESERO", "mesero");
    const cocinaN = await cuenta("COCINA", "cocina");
    const adminN = await cuenta("ADMIN", "admin");
    verificar((await req("POST", "/usuarios", { nombre: "X", email: `sin_sede_${Date.now()}@comidasrapidas.test`, password: process.env.E2E_PASSWORD, role: "MESERO", sedeId: null }, t.admin)).status === 400, "un mesero siempre tiene sede");
    const loginN = await req("POST", "/auth/login", { email: meseroN.email, password: process.env.E2E_PASSWORD });
    verificar(loginN.data?.user?.sede?.nombre === "E2E-S Norte", "al iniciar sesión sabe en qué sede trabaja");
    const [tMeseroN, tCocinaN, tAdminN] = [loginN.data.token as string, await login(cocinaN.email), await login(adminN.email)];

    console.log("\n[sedes] Mesas de cada sede");
    const mesaN = exigir(await req("POST", "/mesas", { numero: "E2E-S-1", capacidad: 4, meseroAsignadoId: meseroN.id }, t.admin, norte.id), "Mesa en Norte");
    verificar(mesaN.sedeId === norte.id, "el admin general crea la mesa en la sede que eligió");
    const mesaP = await req("POST", "/mesas", { numero: "E2E-S-1", capacidad: 4 }, t.admin);
    verificar(mesaP.status === 201 && mesaP.data.sedeId === principal.id, "el mismo número de mesa puede existir en otra sede");
    verificar((await req("POST", "/mesas", { numero: "E2E-S-1", capacidad: 2 }, tAdminN)).status === 409, "pero no dos veces en la misma");
    verificar((await req("POST", "/mesas", { numero: "E2E-S-2", capacidad: 4, meseroAsignadoId: t.meseroId }, tAdminN)).status >= 400, "no se asigna un mesero de otra sede");
    const mesasN = (await req("GET", "/mesas", undefined, tMeseroN)).data as { id: string }[];
    const mesasP = (await req("GET", "/mesas", undefined, t.mesero)).data as { id: string }[];
    verificar(mesasN.some((m) => m.id === mesaN.id) && !mesasN.some((m) => m.id === mesaP.data.id), "cada mesero ve solo las mesas de su sede");
    verificar(!mesasP.some((m) => m.id === mesaN.id), "...y el de la principal no ve las de Norte");
    verificar((await req("POST", "/mesa-sesiones", { mesaId: mesaN.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero)).status === 403, "un mesero no abre una mesa de otra sede");

    console.log("\n[sedes] Cocina y avisos por sede");
    const socketCocinaP = await conectar(t.cocina);
    const socketCocinaN = await conectar(tCocinaN);
    const socketAdminN = await conectar(t.admin, norte.id);
    sockets.push(socketCocinaP, socketCocinaN, socketAdminN);
    const recibidos = { P: [] as string[], N: [] as string[], adminN: [] as string[] };
    socketCocinaP.on("pedido:nuevo", (p: { id: string }) => recibidos.P.push(p.id));
    socketCocinaN.on("pedido:nuevo", (p: { id: string }) => recibidos.N.push(p.id));
    socketAdminN.on("pedido:nuevo", (p: { id: string }) => recibidos.adminN.push(p.id));

    const productos = (await req("GET", "/productos", undefined, tMeseroN)).data.filter((p: { disponible: boolean; requiereCocina: boolean; esCombo: boolean }) => p.disponible && p.requiereCocina && !p.esCombo);
    const [plato, otro] = productos;
    const sesionN = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesaN.id, nombreResponsable: "Ana", comensales: ["Ana"] }, tMeseroN), "Abrir mesa Norte");
    const pedidoN = exigir(await req("POST", "/pedidos", { mesaSesionId: sesionN.id, items: [{ productoId: plato.id, cantidad: 1 }] }, tMeseroN), "Pedido Norte");
    verificar(pedidoN.sedeId === norte.id, "el pedido queda en la sede de la mesa");
    await esperar(600);
    verificar(recibidos.N.includes(pedidoN.id) && !recibidos.P.includes(pedidoN.id), "llega a la cocina de Norte y no a la de la principal");
    verificar(recibidos.adminN.includes(pedidoN.id), "el admin general que está viendo Norte también lo recibe");
    const avisoN = await prisma.notificacion.findFirst({ where: { pedidoId: pedidoN.id, userId: cocinaN.id } });
    const cocinaPId = (await req("GET", "/auth/me", undefined, t.cocina)).data.id;
    const avisoP = await prisma.notificacion.findFirst({ where: { pedidoId: pedidoN.id, userId: cocinaPId } });
    verificar(Boolean(avisoN) && !avisoP, "la notificación de pedido nuevo es solo para la cocina de su sede");
    verificar((await req("GET", "/pedidos/activos", undefined, t.cocina)).data.every((p: { id: string }) => p.id !== pedidoN.id), "el tablero de la principal no lo muestra");
    const item = pedidoN.items[0];
    verificar((await req("PUT", `/pedidos/${pedidoN.id}/items/${item.id}/estado`, { estado: "EN_PREPARACION" }, t.cocina)).status === 403, "la cocina de otra sede no lo puede tocar");

    console.log("\n[sedes] Agotado e inventario por sede");
    exigir(await req("PUT", `/productos/${otro.id}/disponible`, { disponible: false }, tCocinaN), "Agotar en Norte");
    const enNorte = (await req("GET", "/productos", undefined, tMeseroN)).data.find((p: { id: string }) => p.id === otro.id);
    const enPrincipal = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { id: string }) => p.id === otro.id);
    verificar(enNorte?.disponible === false && enPrincipal?.disponible === true, "agotado en Norte sigue disponible en la principal");
    const cartaN = JSON.stringify((await req("GET", `/carta?sede=${norte.id}`)).data);
    const cartaMesa = JSON.stringify((await req("GET", `/carta?mesa=${mesaN.id}`)).data);
    const cartaP = JSON.stringify((await req("GET", "/carta")).data);
    verificar(!cartaN.includes(otro.id) && !cartaMesa.includes(otro.id) && cartaP.includes(otro.id), "la carta del QR de Norte (mesa o mostrador) lo oculta; la de la principal no");
    verificar((await req("POST", "/pedidos", { mesaSesionId: sesionN.id, items: [{ productoId: otro.id, cantidad: 1 }] }, tMeseroN)).status === 409, "en Norte no se puede pedir");

    const bebida = exigir(await req("POST", "/productos", { nombre: "E2E-S Gaseosa", descripcion: "prueba", precio: 3000, tiempoPreparacionMinutos: 1, categoriaId: plato.categoriaId, requiereCocina: false }, t.admin), "Producto");
    creados.productos.push(bebida.id);
    exigir(await req("POST", `/inventario/${bebida.id}/activar`, { stockInicial: 2, stockMinimo: 0 }, tAdminN), "Inventario en Norte");
    const enInventario = async (token: string, sede?: string) =>
      ((await req("GET", "/inventario", undefined, token, sede)).data as { id: string; controlaStock: boolean; stock: number }[]).find((p) => p.id === bebida.id);
    verificar((await enInventario(t.admin))?.controlaStock === false, "el inventario de Norte no se mezcla con el de la principal");
    verificar((await enInventario(t.admin, norte.id))?.stock === 2, "el admin general lo ve eligiendo Norte");
    const deMas = await req("POST", "/pedidos", { mesaSesionId: sesionN.id, items: [{ productoId: bebida.id, cantidad: 3 }] }, tMeseroN);
    verificar(deMas.status === 409 && /Solo quedan 2/.test(deMas.data?.error), `Norte solo tiene 2 → 409 "${deMas.data?.error}"`);
    const bebidas = exigir(await req("POST", "/pedidos", { mesaSesionId: sesionN.id, items: [{ productoId: bebida.id, cantidad: 2 }] }, tMeseroN), "Vender las 2");
    const stockN = await prisma.productoSede.findUnique({ where: { productoId_sedeId: { productoId: bebida.id, sedeId: norte.id } } });
    verificar(stockN?.stock === 0 && !stockN.disponible, "se agota en Norte");
    const agotadoAviso = await prisma.notificacion.findMany({ where: { tipo: "STOCK", mensaje: { contains: "E2E-S Gaseosa" } }, select: { userId: true } });
    verificar(agotadoAviso.some((n) => n.userId === adminN.id), "el aviso de agotado le llega al admin de Norte");
    const principalAdmins = await prisma.user.findMany({ where: { role: "ADMIN", sedeId: principal.id }, select: { id: true } });
    verificar(!agotadoAviso.some((n) => principalAdmins.some((a) => a.id === n.userId)), "y no a los admins de otra sede");
    const enPrincipalBebida = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { id: string }) => p.id === bebida.id);
    verificar(enPrincipalBebida?.disponible === true && enPrincipalBebida.controlaStock === false, "en la principal sigue disponible, sin control de inventario");

    // Con la mesa de Norte abierta.
    verificar((await req("PUT", `/usuarios/${meseroN.id}/sede`, { sedeId: principal.id }, t.admin)).status === 409, "no se pasa de sede a un mesero con mesas abiertas");
    verificar((await req("PUT", `/sedes/${norte.id}`, { activa: false }, t.admin)).status === 409, "no se desactiva una sede con mesas abiertas o personal");

    console.log("\n[sedes] Caja y reportes por sede");
    await despachar(pedidoN.id, { cocina: tCocinaN, entrega: tMeseroN });
    await despachar(bebidas.id, { cocina: tCocinaN, entrega: tMeseroN });
    const cuentaN = exigir(await req("POST", "/facturas", { mesaSesionId: sesionN.id, propinaMonto: 0 }, tMeseroN), "Cuenta Norte");
    verificar(cuentaN.sedeId === norte.id, "la cuenta queda en la sede de la mesa");
    exigir(await req("PUT", `/facturas/${cuentaN.id}/pagar`, { metodoPago: "EFECTIVO" }, tMeseroN), "Pagar en Norte");
    const cajaN = exigir(await req("GET", "/caja/actual", undefined, tAdminN), "Caja Norte");
    verificar(cajaN.cuentasPagadas === 1 && cajaN.totalEfectivo === cuentaN.total, `la caja de Norte tiene su cobro (${cajaN.totalEfectivo})`);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const ventas = (sufijo: string, token: string, sede?: string) => req("GET", `/reportes/ventas?desde=${hoy}&hasta=${hoy}${sufijo}`, undefined, token, sede);
    const repN = (await ventas("", tAdminN)).data;
    const repP = (await ventas("", t.admin)).data;
    const repTodas = (await ventas("&sede=todas", t.admin)).data;
    const tiene = (r: { cuentas: { id: string }[] }) => r.cuentas.some((c) => c.id === cuentaN.id);
    verificar(tiene(repN) && repN.sede === "E2E-S Norte" && !tiene(repP), "el reporte de ventas es de la sede");
    verificar(tiene(repTodas) && repTodas.sede === null && repTodas.porSede.some((s: { sedeId: string; ventas: number }) => s.sedeId === norte.id && s.ventas === cuentaN.total), "con todas las sedes, suma y compara por sede");
    verificar(tiene((await ventas("", t.admin, norte.id)).data), "el admin general puede ver solo Norte");

    console.log("\n[sedes] Lo que puede el admin de una sede");
    const repNTodas = (await ventas("&sede=todas", tAdminN, principal.id)).data;
    verificar(repNTodas.sede === "E2E-S Norte" && tiene(repNTodas) && repNTodas.porSede.length === 0, "el admin de Norte no ve otras sedes aunque las pida");
    const usuariosN = (await req("GET", "/usuarios", undefined, tAdminN)).data as { id: string; sedeId: string }[];
    verificar(usuariosN.length >= 3 && usuariosN.every((u) => u.sedeId === norte.id), "solo ve al personal de su sede");
    verificar((await req("PUT", `/usuarios/${t.meseroId}/nombre`, { nombre: "Otro" }, tAdminN)).status === 403, "no edita personal de otra sede");
    verificar((await req("PUT", `/sedes/${principal.id}`, { direccion: "x" }, tAdminN)).status === 403, "no edita otra sede");
    verificar((await req("PUT", `/sedes/${norte.id}`, { nombre: "E2E-S Otro nombre" }, tAdminN)).status === 403, "ni el nombre de la suya");
    verificar((await req("PUT", `/sedes/${norte.id}`, { cajaPlaca: "CAJA-NORTE", cajaUbicacion: "Norte" }, tAdminN)).status === 200, "pero sí los datos de su caja");
    verificar((await req("PUT", "/facturacion/configuracion", {}, tAdminN)).status === 403, "la facturación del negocio la configura el general");
    verificar((await req("PUT", "/configuracion", { propinaPctCocina: 10, propinaModo: "POZO" }, tAdminN)).status === 403, "igual las reglas de propinas");
    const gastoGeneral = await req("POST", "/gastos", { dia: hoy, categoria: "OTROS", concepto: "E2E-S general", monto: 1000, general: true }, tAdminN);
    verificar(gastoGeneral.status === 403, "no registra gastos generales del negocio");

    console.log("\n[sedes] Mover personal");
    verificar((await req("PUT", `/sedes/${principal.id}`, { esPrincipal: false }, t.admin)).status === 400, "siempre hay una sede principal");
    const movido = await req("PUT", `/usuarios/${cocinaN.id}/sede`, { sedeId: principal.id }, t.admin);
    verificar(movido.status === 200 && movido.data.sedeId === principal.id, "sin nada abierto, se pasa de sede");
    const tCocinaMovida = await login(cocinaN.email);
    verificar((await req("GET", "/sedes", undefined, tCocinaMovida)).data.actual === principal.id, "y desde ya trabaja en la otra sede");
  } finally {
    for (const s of sockets) s.close();
    await limpiar(creados);
  }
}
