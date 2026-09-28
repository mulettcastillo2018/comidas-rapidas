import { prisma } from "../lib/prisma";
import { emitSolicitudActualizada } from "../realtime/socket";

const INTERVALO_MS = 5 * 60_000;
// Si en una hora nadie confirmó el pedido del cliente, ya no es vigente (se
// fue, o el mesero lo tomó a mano) y solo estorba en la lista y en el tope
// de pendientes por mesa.
const MINUTOS_VIGENCIA_SOLICITUD = 60;
const DIAS_VIGENCIA_NOTIFICACION = 7;

export function iniciarLimpiezaPeriodica() {
  const correr = () => limpiar().catch((err) => console.error("Error en la limpieza periódica:", err));
  correr();
  setInterval(correr, INTERVALO_MS);
}

async function limpiar() {
  await vencerSolicitudesViejas();
  await prisma.notificacion.deleteMany({
    where: { creadaEn: { lt: new Date(Date.now() - DIAS_VIGENCIA_NOTIFICACION * 24 * 60 * 60_000) } },
  });
}

// resueltaPorId queda vacío: así se distingue una solicitud vencida sola de
// una que un mesero descartó.
async function vencerSolicitudesViejas() {
  const limite = new Date(Date.now() - MINUTOS_VIGENCIA_SOLICITUD * 60_000);
  const viejas = await prisma.solicitudPedido.findMany({
    where: { estado: "PENDIENTE", creadaEn: { lt: limite } },
    select: { id: true },
  });
  if (viejas.length === 0) return;

  const ids = viejas.map((s) => s.id);
  // Condicionado a PENDIENTE por si un mesero la confirma justo ahora.
  await prisma.solicitudPedido.updateMany({
    where: { id: { in: ids }, estado: "PENDIENTE" },
    data: { estado: "DESCARTADA", resueltaEn: new Date() },
  });
  const vencidas = await prisma.solicitudPedido.findMany({
    where: { id: { in: ids }, estado: "DESCARTADA", resueltaPorId: null },
    include: { mesa: { select: { id: true, numero: true } } },
  });
  for (const solicitud of vencidas) emitSolicitudActualizada(solicitud);
}
