import { prisma } from "../lib/prisma";
import { enlaces, notificarPorRol } from "./notificaciones";

const INTERVALO_MS = 30_000;

// Corre en segundo plano mientras el proceso vive: revisa periódicamente si
// algún producto activo (recibido o en preparación) ya se pasó de su tiempo
// de preparación y, si nadie lo ha marcado, avisa a cocina. `retrasoNotificado`
// evita repetir el aviso en cada tick.
export function iniciarRevisionRetrasos() {
  setInterval(() => {
    revisarItemsRetrasados().catch((err) => console.error("Error revisando retrasos:", err));
  }, INTERVALO_MS);
}

async function revisarItemsRetrasados() {
  const items = await prisma.pedidoItem.findMany({
    where: { estado: { in: ["RECIBIDO", "EN_PREPARACION"] }, retrasoNotificado: false },
    include: { producto: true, pedido: { include: { mesaSesion: { include: { mesa: true } } } } },
  });

  const ahora = Date.now();
  for (const item of items) {
    const referencia = item.iniciadoEn ?? item.pedido.creadoEn;
    const minutosTranscurridos = (ahora - referencia.getTime()) / 60000;
    if (minutosTranscurridos <= item.tiempoPreparacionMinutos) continue;

    const ubicacion = item.pedido.mesaSesion
      ? `Mesa ${item.pedido.mesaSesion.mesa.numero}`
      : `Mostrador — ${item.pedido.nombreCliente ?? "cliente"}`;
    await prisma.pedidoItem.update({ where: { id: item.id }, data: { retrasoNotificado: true } });
    await notificarPorRol({
      rol: "COCINA",
      tipo: "ITEM_RETRASADO",
      mensaje: `${item.producto.nombre} de ${ubicacion} lleva más de ${item.tiempoPreparacionMinutos} min — ¿va atrasado o ya salió y falta marcarlo?`,
      pedidoId: item.pedidoId,
      pedidoItemId: item.id,
      enlace: enlaces.cocina(item.pedidoId, item.id),
    });
  }
}
