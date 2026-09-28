import { prisma } from "../../src/lib/prisma";
import { esperar, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// La notificación más reciente de un usuario que cumpla la condición.
async function ultima(userId: string, where: object) {
  return prisma.notificacion.findFirst({ where: { userId, ...where }, orderBy: { creadaEn: "desc" } });
}

// Cada notificación guarda a qué pantalla lleva al hacerle clic y qué
// resaltar allí (el pedido, el producto, la mesa o la solicitud).
export async function probarNotificaciones() {
  const creados = registroDeCreados("E2E-F-");
  creados.textos.push("Notif E2E");
  try {
    const t = await sesiones();
    const cocinaId: string = (await req("GET", "/auth/me", undefined, t.cocina)).data.id;
    const adminId: string = (await req("GET", "/auth/me", undefined, t.admin)).data.id;
    const productos = (await req("GET", "/productos", undefined, t.mesero)).data.filter((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const [A, B] = productos;
    const mesaAsignada = (await req("POST", "/mesas", { numero: "E2E-F-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const mesaLibre = (await req("POST", "/mesas", { numero: "E2E-F-2", capacidad: 4 }, t.admin)).data;

    console.log("[notificaciones] Pedido QR en una mesa sin abrir → grilla de mesas");
    await req("POST", "/solicitudes", { mesaId: mesaAsignada.id, items: [{ productoId: A.id, cantidad: 1 }] });
    const aviso1 = await ultima(t.meseroId, { tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje: { contains: "E2E-F-1" } });
    verificar(aviso1?.enlace === `/mesero?mesa=${mesaAsignada.id}`, `lleva a la grilla con la mesa resaltada (${aviso1?.enlace})`);

    console.log("\n[notificaciones] Pedido QR en una mesa ya abierta → esa mesa, solo a quien la atiende");
    const sesion = (await req("POST", "/mesa-sesiones", { mesaId: mesaLibre.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero)).data;
    await req("POST", "/solicitudes", { mesaId: mesaLibre.id, items: [{ productoId: A.id, cantidad: 1 }] });
    const avisos = await prisma.notificacion.findMany({ where: { tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje: { contains: "E2E-F-2" } } });
    verificar(avisos.length === 1 && avisos[0].userId === t.meseroId, `solo le llega al mesero que atiende la mesa (${avisos.length} aviso/s)`);
    verificar(avisos[0]?.enlace === `/mesero/mesa/${sesion.id}`, `lleva a la mesa abierta (${avisos[0]?.enlace})`);

    console.log("\n[notificaciones] Cocina: pedido nuevo y cancelación → tablero con el pedido resaltado");
    const pedido = (await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: A.id, cantidad: 1 }, { productoId: B.id, cantidad: 1 }] }, t.mesero)).data;
    const nuevo = await ultima(cocinaId, { tipo: "PEDIDO_NUEVO", pedidoId: pedido.id });
    verificar(nuevo?.enlace === `/cocina?pedido=${pedido.id}`, `pedido nuevo (${nuevo?.enlace})`);
    const [itemA, itemB] = pedido.items;
    await req("PUT", `/pedidos/${pedido.id}/items/${itemB.id}/estado`, { estado: "EN_PREPARACION" }, t.cocina);
    await req("PUT", `/pedidos/${pedido.id}/items/${itemB.id}/estado`, { estado: "CANCELADO" }, t.mesero);
    const cancelado = await ultima(cocinaId, { tipo: "ITEM_CANCELADO", pedidoId: pedido.id });
    verificar(cancelado?.enlace === `/cocina?pedido=${pedido.id}`, `producto cancelado (${cancelado?.enlace})`);

    console.log("\n[notificaciones] Mesero: producto listo → su mesa, con ese producto resaltado");
    await req("PUT", `/pedidos/${pedido.id}/items/${itemA.id}/estado`, { estado: "EN_PREPARACION" }, t.cocina);
    await req("PUT", `/pedidos/${pedido.id}/items/${itemA.id}/estado`, { estado: "LISTO" }, t.cocina);
    const listo = await ultima(t.meseroId, { tipo: "ITEM_LISTO", pedidoItemId: itemA.id });
    verificar(listo?.enlace === `/mesero/mesa/${sesion.id}?item=${itemA.id}`, `producto listo (${listo?.enlace})`);
    const deLaApi = (await req("GET", "/notificaciones", undefined, t.mesero)).data;
    verificar(deLaApi.some((n: { id: string; enlace: string }) => n.id === listo?.id && n.enlace === listo?.enlace), "la API entrega el destino a la campana");
    await req("PUT", `/pedidos/${pedido.id}/items/${itemA.id}/estado`, { estado: "ENTREGADO" }, t.mesero);

    console.log("\n[notificaciones] Retraso → tablero con ese producto puntual resaltado");
    const lento = (await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: A.id, cantidad: 1 }] }, t.mesero)).data;
    await prisma.pedido.update({ where: { id: lento.id }, data: { creadoEn: new Date(Date.now() - 3 * 60 * 60_000) } });
    // El servidor revisa los retrasos cada 30 s.
    let retraso = null;
    for (let i = 0; i < 45 && !retraso; i++) {
      await esperar(1000);
      retraso = await ultima(cocinaId, { tipo: "ITEM_RETRASADO", pedidoItemId: lento.items[0].id });
    }
    verificar(retraso?.enlace === `/cocina?pedido=${lento.id}&item=${lento.items[0].id}`, `aviso de retraso (${retraso?.enlace})`);
    await req("PUT", `/pedidos/${lento.id}/estado`, { estado: "CANCELADO" }, t.mesero);

    console.log("\n[notificaciones] Pedido de mostrador → caja, con la solicitud resaltada");
    const mostrador = (await req("POST", "/solicitudes", {
      mesaId: null,
      nombreCliente: "Notif E2E",
      telefonoCliente: "3000000000",
      aceptaDatos: true,
      items: [{ productoId: A.id, cantidad: 1 }],
    })).data;
    creados.solicitudes.push(mostrador.id);
    const caja = await ultima(adminId, { tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje: { contains: "Notif E2E" } });
    verificar(caja?.enlace === `/admin/mostrador?solicitud=${mostrador.id}`, `pedido de mostrador (${caja?.enlace})`);
    // Que no quede esperando en la caja real.
    await req("PUT", `/solicitudes/${mostrador.id}/descartar`, undefined, t.admin);
  } finally {
    await limpiar(creados);
  }
}
