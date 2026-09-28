import { prisma } from "../../src/lib/prisma";
import { conectar, despachar, esperar, exigir, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

const hora = (iso: string) => new Date(iso);

// Lo que ve y usa el cliente (llamar al mesero, pedir la cuenta, calificar)
// y los reportes de demanda por hora y rotación de mesas.
export async function probarExperiencia() {
  const creados = registroDeCreados("E2E-J-");
  creados.textos.push("Opinion E2E");
  const sockets: { close: () => void }[] = [];
  try {
    const t = await sesiones();
    const adminId: string = (await req("GET", "/auth/me", undefined, t.admin)).data.id;
    const producto = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const crearMesa = async (n: string) =>
      exigir(await req("POST", "/mesas", { numero: `E2E-J-${n}`, capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Crear mesa");
    const abrir = async (mesaId: string, comensales = ["Ana"]) =>
      exigir(await req("POST", "/mesa-sesiones", { mesaId, nombreResponsable: comensales[0], comensales }, t.mesero), "Abrir mesa");

    console.log("[experiencia] Llamar al mesero y pedir la cuenta desde el QR");
    const socket = await conectar(t.mesero);
    sockets.push(socket);
    const enVivo: { mesaId: string; tipo: string }[] = [];
    socket.on("mesa:llamado", (l) => enVivo.push(l));
    const libre = await crearMesa("1");
    verificar((await req("POST", "/llamados", { mesaId: libre.id, tipo: "MESERO" })).status === 201, "la mesa llama al mesero");
    const repetido = await req("POST", "/llamados", { mesaId: libre.id, tipo: "MESERO" });
    verificar(repetido.status === 429, `tocar de nuevo al instante no repite el aviso: "${repetido.data?.error}"`);
    const avisoLibre = await prisma.notificacion.findFirst({ where: { userId: t.meseroId, tipo: "LLAMADO_MESA", mensaje: { contains: "E2E-J-1 te está llamando" } } });
    verificar(avisoLibre?.enlace === `/mesero?mesa=${libre.id}`, "sin mesa abierta, el aviso lleva a la grilla con la mesa resaltada");
    await esperar(300);
    verificar(enVivo.some((l) => l.mesaId === libre.id && l.tipo === "MESERO"), "la grilla del mesero se entera en vivo");
    verificar((await req("POST", "/llamados", { mesaId: "no-existe", tipo: "CUENTA" })).status === 404, "mesa inexistente → 404");

    const abierta = await crearMesa("2");
    const sesion = await abrir(abierta.id);
    verificar(typeof sesion.codigoEncuesta === "string" && sesion.codigoEncuesta.length >= 10, "cada mesa abierta trae su código de encuesta");
    verificar((await req("POST", "/llamados", { mesaId: abierta.id, tipo: "CUENTA" })).status === 201, "la mesa pide la cuenta");
    const avisoCuenta = await prisma.notificacion.findFirst({ where: { userId: t.meseroId, tipo: "LLAMADO_MESA", mensaje: { contains: "E2E-J-2 pide la cuenta" } } });
    verificar(avisoCuenta?.enlace === `/mesero/mesa/${sesion.id}`, "con la mesa abierta, el aviso lleva directo a esa mesa");

    console.log("\n[experiencia] Encuesta de satisfacción");
    const estado = (await req("GET", `/encuestas/${sesion.codigoEncuesta}`)).data;
    verificar(estado.contexto === "Mesa E2E-J-2" && estado.yaRespondida === false, `encuesta de la ${estado.contexto}`);
    verificar((await req("POST", `/encuestas/${sesion.codigoEncuesta}`, { calificacion: 6 })).status === 400, "calificación fuera de 1 a 5 → 400");
    verificar((await req("POST", `/encuestas/${sesion.codigoEncuesta}`, { calificacion: 2, comentario: "Opinion E2E: llegó frío" })).status === 201, "se guarda la opinión");
    verificar((await req("POST", `/encuestas/${sesion.codigoEncuesta}`, { calificacion: 5 })).status === 409, "una sola opinión por visita");
    verificar((await req("GET", `/encuestas/${sesion.codigoEncuesta}`)).data.yaRespondida === true, "queda como respondida");
    const alerta = await prisma.notificacion.findFirst({ where: { userId: adminId, tipo: "OPINION", mensaje: { contains: "Opinion E2E" } } });
    verificar(Boolean(alerta), "una mala calificación le avisa al admin el mismo día");
    verificar((await req("GET", "/encuestas/no-existe")).status === 404, "código inexistente → 404");
    const mostrador = exigir(
      await req("POST", "/solicitudes", { mesaId: null, nombreCliente: "Opinion E2E", telefonoCliente: "3000000000", aceptaDatos: true, items: [{ productoId: producto.id, cantidad: 1 }] }),
      "Pedido de mostrador"
    );
    creados.solicitudes.push(mostrador.id);
    verificar((await req("POST", `/encuestas/${mostrador.codigoSeguimiento}`, { calificacion: 5 })).status === 201, "también se califica un pedido de mostrador");

    console.log("\n[experiencia] Reporte de opiniones");
    await prisma.encuesta.updateMany({ where: { OR: [{ mesaSesionId: sesion.id }, { solicitudId: mostrador.id }] }, data: { creadaEn: hora("2020-03-05T15:00:00-05:00") } });
    const opiniones = (await req("GET", "/reportes/satisfaccion?desde=2020-03-05&hasta=2020-03-05", undefined, t.admin)).data;
    verificar(opiniones.total === 2 && opiniones.promedio === 3.5, `2 opiniones, promedio 3.5 (${opiniones.total}, ${opiniones.promedio})`);
    verificar(opiniones.distribucion[2] === 1 && opiniones.distribucion[5] === 1, "distribución por estrellas");
    const delMesero = opiniones.porMesero.find((m: { meseroId: string }) => m.meseroId === t.meseroId);
    verificar(delMesero?.promedio === 2 && delMesero.opiniones === 1, "opiniones por mesero");
    verificar(opiniones.recientes.some((o: { comentario: string }) => o.comentario?.includes("llegó frío")), "se ven los comentarios");
    verificar((await req("GET", "/reportes/satisfaccion?desde=2020-03-05&hasta=2020-03-05", undefined, t.mesero)).status === 403, "un mesero no ve las opiniones");

    console.log("\n[experiencia] Pedidos por hora y rotación de mesas");
    const mesaRotacion = await crearMesa("3");
    const visita = await abrir(mesaRotacion.id, ["Ana", "Beto", "Caro"]);
    const pedido = exigir(await req("POST", "/pedidos", { mesaSesionId: visita.id, items: [{ productoId: producto.id, cantidad: 2 }] }, t.mesero), "Pedido");
    await despachar(pedido.id, { cocina: t.cocina, entrega: t.mesero });
    const cuenta = exigir(await req("POST", "/facturas", { mesaSesionId: visita.id }, t.mesero), "Cuenta");
    exigir(await req("PUT", `/facturas/${cuenta.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero), "Pagar");
    // Jueves 5 de marzo de 2020: llegaron 1:00 p. m., pidieron 1:20, se fueron 1:45.
    await prisma.pedido.update({ where: { id: pedido.id }, data: { creadoEn: hora("2020-03-05T13:20:00-05:00") } });
    await prisma.mesaSesion.update({ where: { id: visita.id }, data: { abiertaEn: hora("2020-03-05T13:00:00-05:00"), cerradaEn: hora("2020-03-05T13:45:00-05:00") } });
    await prisma.factura.update({ where: { id: cuenta.id }, data: { pagadaEn: hora("2020-03-05T13:45:00-05:00") } });
    const r = (await req("GET", "/reportes/ventas?desde=2020-03-05&hasta=2020-03-05", undefined, t.admin)).data;
    const a13 = r.porHora.find((h: { hora: number }) => h.hora === 13);
    verificar(r.porHora.length === 24 && a13?.pedidos === 1 && a13.ventas === cuenta.subtotal, "el pedido cuenta en la 1 p. m. (hora de Colombia)");
    const jueves = r.porDiaSemana.find((d: { nombre: string }) => d.nombre === "Jueves");
    verificar(jueves?.pedidos === 1 && jueves.dias === 1, "y en los jueves");
    verificar(r.rotacion.mesasAtendidas === 1 && r.rotacion.duracionPromedioMin === 45, `la mesa se ocupó 45 min (${r.rotacion.duracionPromedioMin})`);
    verificar(r.rotacion.comensalesPromedio === 3 && r.rotacion.ticketPromedioMesa === cuenta.total, "3 personas, ticket de la mesa");
    verificar(r.rotacion.porMesa[0]?.mesa === "E2E-J-3" && r.rotacion.porMesa[0].veces === 1, "rotación por mesa");
  } finally {
    for (const s of sockets) s.close();
    await limpiar(creados);
  }
}
