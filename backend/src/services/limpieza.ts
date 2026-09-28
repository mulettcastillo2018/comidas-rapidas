import { prisma } from "../lib/prisma";
import { emitSolicitudActualizada } from "../realtime/socket";

const INTERVALO_MS = 5 * 60_000;
// Si en una hora nadie confirmó el pedido del cliente, ya no es vigente (se
// fue, o el mesero lo tomó a mano) y solo estorba en la lista y en el tope
// de pendientes por mesa.
const MINUTOS_VIGENCIA_SOLICITUD = 60;
const DIAS_VIGENCIA_NOTIFICACION = 7;
// El teléfono de un cliente de mostrador solo sirve para avisarle de ese
// pedido (Ley 1581: se usa para la finalidad autorizada y no se guarda más de
// lo necesario). El nombre se conserva porque identifica la venta.
const DIAS_VIGENCIA_TELEFONO = 30;

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
  const limiteTelefono = new Date(Date.now() - DIAS_VIGENCIA_TELEFONO * 24 * 60 * 60_000);
  await prisma.solicitudPedido.updateMany({
    where: { telefonoCliente: { not: null }, creadaEn: { lt: limiteTelefono } },
    data: { telefonoCliente: null },
  });
  await prisma.pedido.updateMany({
    where: { telefonoCliente: { not: null }, creadoEn: { lt: limiteTelefono } },
    data: { telefonoCliente: null },
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
