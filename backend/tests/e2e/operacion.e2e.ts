import { prisma } from "../../src/lib/prisma";
import { conectar, esperar, estados, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Bebidas que no pasan por cocina, agotados, agregar comensales y cambiar
// de mesa.
export async function probarOperacion() {
  const creados = registroDeCreados("E2E-E-");
  const sockets: { close: () => void }[] = [];
  let productoAgotadoId: string | null = null;
  try {
    const t = await sesiones();
    const A = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const gaseosa = (await req("POST", "/productos", {
      nombre: "E2E-E- Gaseosa", descripcion: "prueba", precio: 4000, tiempoPreparacionMinutos: 1, categoriaId: A.categoriaId, requiereCocina: false,
    }, t.admin)).data;
    creados.productos.push(gaseosa.id);
    const crearMesa = async (n: string, capacidad: number) =>
      (await req("POST", "/mesas", { numero: `E2E-E-${n}`, capacidad, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const [mesa1, mesa2, mesa3] = [await crearMesa("1", 2), await crearMesa("2", 4), await crearMesa("3", 2)];

    const eventos = { producto: [] as { id: string; disponible: boolean }[], sesion: [] as { id: string; comensales: unknown[] }[], cocina: [] as { id: string; mesaSesion: { mesa: { numero: string } } }[] };
    const socketMesero = await conectar(t.mesero);
    const socketCocina = await conectar(t.cocina);
    sockets.push(socketMesero, socketCocina);
    socketMesero.on("producto:actualizado", (p) => eventos.producto.push(p));
    socketMesero.on("mesaSesion:nueva", (s) => eventos.sesion.push(s));
    socketCocina.on("pedido:actualizado", (p) => eventos.cocina.push(p));

    const sesion = (await req("POST", "/mesa-sesiones", { mesaId: mesa1.id, nombreResponsable: "Ana", comensales: ["Ana", "Beto"] }, t.mesero)).data;

    console.log("[operación] Productos que no pasan por cocina");
    const mixto = (await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: A.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 2 }] }, t.mesero)).data;
    const itemGaseosa = mixto.items.find((i: { productoId: string }) => i.productoId === gaseosa.id);
    verificar(itemGaseosa.estado === "LISTO" && mixto.estado === "RECIBIDO", "la gaseosa nace lista; lo de cocina sigue en espera");
    const aviso = await prisma.notificacion.findFirst({ where: { pedidoId: mixto.id, tipo: "PEDIDO_NUEVO" } });
    verificar(/1 producto/.test(aviso?.mensaje ?? ""), `a cocina solo se le anuncia lo suyo: "${aviso?.mensaje}"`);
    const soloBebidas = (await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: gaseosa.id, cantidad: 1 }] }, t.mesero)).data;
    verificar(soloBebidas.estado === "LISTO", "pedido de solo bebidas nace listo");
    verificar((await prisma.notificacion.count({ where: { pedidoId: soloBebidas.id, tipo: "PEDIDO_NUEVO" } })) === 0, "y no se le avisa a cocina");

    console.log("\n[operación] Cocina marca agotados");
    const solicitudAntes = (await req("POST", "/solicitudes", { mesaId: mesa1.id, items: [{ productoId: A.id, cantidad: 1 }] })).data;
    verificar((await req("PUT", `/productos/${A.id}/disponible`, { disponible: false }, t.mesero)).status === 403, "un mesero no puede (403)");
    productoAgotadoId = A.id;
    verificar((await req("PUT", `/productos/${A.id}/disponible`, { disponible: false }, t.cocina)).data?.disponible === false, "cocina lo marca agotado");
    await esperar(300);
    verificar(eventos.producto.some((p) => p.id === A.id && !p.disponible), "los meseros se enteran en vivo");
    verificar((await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: A.id, cantidad: 1 }] }, t.mesero)).status === 409, "pedirlo → 409");
    verificar((await req("POST", "/solicitudes", { mesaId: mesa1.id, items: [{ productoId: A.id, cantidad: 1 }] })).status === 409, "pedirlo por QR → 409");
    verificar((await req("PUT", `/solicitudes/${solicitudAntes.id}/confirmar`, undefined, t.mesero)).status === 409, "confirmar un pedido QR armado antes de agotarse → 409");
    const carta = (await req("GET", "/carta")).data;
    verificar(!carta.some((c: { productos: { id: string }[] }) => c.productos.some((p) => p.id === A.id)), "sale de la carta pública");
    await req("PUT", `/productos/${A.id}/disponible`, { disponible: true }, t.cocina);
    productoAgotadoId = null;

    console.log("\n[operación] Agregar comensales");
    verificar((await req("POST", `/mesa-sesiones/${sesion.id}/comensales`, { nombre: "Caro" }, t.mesero)).status === 400, "mesa llena: pide confirmar silla");
    const conSilla = (await req("POST", `/mesa-sesiones/${sesion.id}/comensales`, { nombre: "Caro", confirmaSillaExtra: true }, t.mesero)).data;
    verificar(conSilla.comensales.length === 3 && conSilla.sillasAdicionales === 1, "3 comensales, 1 silla extra");
    await esperar(300);
    verificar(eventos.sesion.some((s) => s.id === sesion.id && s.comensales.length === 3), "los demás equipos lo ven en vivo");

    console.log("\n[operación] Cambiar de mesa");
    verificar((await req("PUT", `/mesa-sesiones/${sesion.id}/mover`, { mesaId: mesa3.id }, t.mesero)).status === 400, "a una mesa pequeña: pide confirmar sillas");
    const mover = (await req("PUT", `/mesa-sesiones/${sesion.id}/mover`, { mesaId: mesa2.id }, t.mesero)).data;
    verificar(mover.mesaId === mesa2.id && mover.sillasAdicionales === 0, "movida a la mesa para 4");
    const [m1, m2] = await Promise.all([mesa1, mesa2].map((m) => prisma.mesa.findUniqueOrThrow({ where: { id: m.id } })));
    verificar(m1.estado === "LIBRE" && m2.estado === "OCUPADA", "la vieja queda libre y la nueva ocupada");
    verificar((await prisma.solicitudPedido.findUnique({ where: { id: solicitudAntes.id } }))?.mesaId === mesa2.id, "el pedido QR pendiente se va con el grupo");
    await esperar(300);
    verificar(eventos.cocina.some((p) => p.id === mixto.id && p.mesaSesion.mesa.numero === "E2E-E-2"), "cocina ve la mesa nueva");
    const dobles = await Promise.all([mesa1, mesa3].map((m) => req("PUT", `/mesa-sesiones/${sesion.id}/mover`, { mesaId: m.id, confirmaSillaExtra: true }, t.mesero)));
    verificar(estados(dobles) === "200,409", `dos cambios simultáneos: uno pasa (${estados(dobles)})`);
    const ocupadas = await prisma.mesa.findMany({ where: { numero: { startsWith: "E2E-E-" }, estado: "OCUPADA" } });
    const final = await prisma.mesaSesion.findUniqueOrThrow({ where: { id: sesion.id } });
    verificar(ocupadas.length === 1 && ocupadas[0].id === final.mesaId, "no queda ninguna mesa ocupada sin nadie");

    console.log("\n[operación] Con la cuenta generada ya no se modifica");
    await req("PUT", `/solicitudes/${solicitudAntes.id}/descartar`, undefined, t.mesero);
    const itemA = mixto.items.find((i: { productoId: string }) => i.productoId === A.id);
    await req("PUT", `/pedidos/${mixto.id}/items/${itemA.id}/estado`, { estado: "CANCELADO" }, t.mesero);
    for (const p of [mixto, soloBebidas]) {
      for (const i of p.items.filter((x: { estado: string }) => x.estado === "LISTO")) {
        await req("PUT", `/pedidos/${p.id}/items/${i.id}/estado`, { estado: "ENTREGADO" }, t.mesero);
      }
    }
    const cuenta = await req("POST", "/facturas", { mesaSesionId: sesion.id }, t.mesero);
    verificar(cuenta.data?.subtotal === 3 * gaseosa.precio, `solo se cobran las 3 gaseosas (${cuenta.data?.subtotal})`);
    const otraMesa = final.mesaId === mesa1.id ? mesa3.id : mesa1.id;
    const tarde = await Promise.all([
      req("POST", `/mesa-sesiones/${sesion.id}/comensales`, { nombre: "Dani", confirmaSillaExtra: true }, t.mesero),
      req("PUT", `/mesa-sesiones/${sesion.id}/mover`, { mesaId: otraMesa, confirmaSillaExtra: true }, t.mesero),
    ]);
    verificar(estados(tarde) === "409,409", "agregar comensal o mover después de la cuenta → 409");
    await req("PUT", `/facturas/${cuenta.data.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero);
  } finally {
    for (const s of sockets) s.close();
    // Un producto real marcado agotado por la prueba se restaura pase lo que pase.
    if (productoAgotadoId) await prisma.producto.update({ where: { id: productoAgotadoId }, data: { disponible: true } });
    await limpiar(creados);
  }
}
