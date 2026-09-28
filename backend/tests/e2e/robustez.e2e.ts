import { prisma } from "../../src/lib/prisma";
import { ejecutarLimpieza } from "../../src/services/limpieza";
import { API_URL, conectar, esperar, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

async function subirArchivo(token: string, nombre: string, tipo: string, bytes: number) {
  const form = new FormData();
  form.append("imagen", new Blob([Buffer.alloc(bytes, 1)], { type: tipo }), nombre);
  const res = await fetch(`${API_URL}/productos/no-existe/imagen`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Mesas que se desactivan en vez de borrarse, límites contra abuso,
// limpieza automática y errores que antes terminaban en 500.
export async function probarRobustez() {
  const creados = registroDeCreados("E2E-B-");
  const socketsAbiertos: { close: () => void }[] = [];
  try {
    const t = await sesiones();
    const producto = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { disponible: boolean }) => p.disponible);
    const crearMesa = (numero: string) => req("POST", "/mesas", { numero: `E2E-B-${numero}`, capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin);
    const pedirPorQr = (mesaId: string) => req("POST", "/solicitudes", { mesaId, items: [{ productoId: producto.id, cantidad: 1 }] });

    const eventosMesa: { id: string; activa: boolean; eliminada?: boolean }[] = [];
    const socket = await conectar(t.mesero);
    socketsAbiertos.push(socket);
    socket.on("mesa:actualizada", (m) => eventosMesa.push(m));

    console.log("[robustez] Mesa sin historial: se borra de verdad");
    const sinHistorial = await crearMesa("1");
    verificar(sinHistorial.status === 201, "mesa creada");
    const duplicada = await crearMesa("1");
    verificar(duplicada.status === 409 && /Ya existe/.test(duplicada.data?.error), `número repetido rechazado: "${duplicada.data?.error}"`);
    const borrado = await req("DELETE", `/mesas/${sinHistorial.data.id}`, undefined, t.admin);
    verificar(borrado.data?.eliminada === true && (await prisma.mesa.count({ where: { id: sinHistorial.data.id } })) === 0, "borrada de la base de datos");
    await esperar(300);
    verificar(eventosMesa.some((m) => m.id === sinHistorial.data.id && m.eliminada), "los meseros la ven desaparecer en vivo");

    console.log("\n[robustez] Mesa con historial: solo se desactiva");
    const conHistorial = (await crearMesa("2")).data;
    verificar((await pedirPorQr(conHistorial.id)).status === 201, "pedido por QR registrado (le deja historial)");
    const desactivar = await req("DELETE", `/mesas/${conHistorial.id}`, undefined, t.admin);
    verificar(desactivar.data?.eliminada === false && desactivar.data?.mesa?.activa === false, "desactivada, no borrada");
    const listaMesero = (await req("GET", "/mesas?incluirInactivas=true", undefined, t.mesero)).data;
    verificar(!listaMesero.some((m: { id: string }) => m.id === conHistorial.id), "el mesero ya no la ve");
    const listaAdmin = (await req("GET", "/mesas?incluirInactivas=true", undefined, t.admin)).data;
    verificar(listaAdmin.some((m: { id: string; activa: boolean }) => m.id === conHistorial.id && !m.activa), "el admin sí, como desactivada");
    verificar((await pedirPorQr(conHistorial.id)).status === 404, "su QR ya no recibe pedidos");
    const abrir = await req("POST", "/mesa-sesiones", { mesaId: conHistorial.id, nombreResponsable: "X", comensales: ["X"] }, t.mesero);
    verificar(abrir.status === 404, "no se puede abrir");
    const recrear = await crearMesa("2");
    verificar(recrear.status === 409 && /desactivada/.test(recrear.data?.error), `crearla de nuevo sugiere reactivarla: "${recrear.data?.error}"`);
    const reactivar = await req("PUT", `/mesas/${conHistorial.id}`, { activa: true }, t.admin);
    verificar(reactivar.data?.activa === true, "reactivada");

    console.log("\n[robustez] Tope de pedidos QR sin confirmar por mesa (5)");
    const mesaTope = (await crearMesa("3")).data;
    const respuestas = [];
    for (let i = 0; i < 6; i++) respuestas.push(await pedirPorQr(mesaTope.id));
    verificar(respuestas.slice(0, 5).every((r) => r.status === 201) && respuestas[5].status === 429, `el 6º se rechaza: "${respuestas[5].data?.error}"`);

    if (process.env.E2E_INCLUIR_LIMITE_IP === "1") {
      console.log("\n[robustez] Límite de 30 pedidos QR por dispositivo en 10 min");
      let rechazo = null;
      for (let n = 4; n <= 12 && !rechazo; n++) {
        const mesa = (await crearMesa(String(n))).data;
        for (let i = 0; i < 5 && !rechazo; i++) {
          const r = await pedirPorQr(mesa.id);
          if (r.status !== 201) rechazo = r;
        }
      }
      verificar(rechazo?.status === 429 && /dispositivo/.test(rechazo.data?.error), `corta: "${rechazo?.data?.error}"`);
    }

    console.log("\n[robustez] Intentos fallidos de login");
    const falsa = `nadie_${Date.now()}@comidasrapidas.test`;
    const intentos = [];
    for (let i = 0; i < 9; i++) intentos.push((await req("POST", "/auth/login", { email: falsa, password: "incorrecta" })).status);
    verificar(intentos.slice(0, 8).every((s) => s === 401) && intentos[8] === 429, `8 fallos dan 401 y el 9º se bloquea (${intentos.join(",")})`);

    console.log("\n[robustez] Errores que antes eran 500");
    const inexistente = await req("PUT", "/mesas/no-existe", { capacidad: 2 }, t.admin);
    verificar(inexistente.status === 404, `registro inexistente → 404 "${inexistente.data?.error}"`);
    const formato = await subirArchivo(t.admin, "nota.txt", "text/plain", 10);
    verificar(formato.status === 400, `archivo que no es imagen → 400 "${formato.data?.error}"`);
    const grande = await subirArchivo(t.admin, "foto.jpg", "image/jpeg", 6 * 1024 * 1024);
    verificar(grande.status === 400, `imagen de 6 MB → 400 "${grande.data?.error}"`);

    console.log("\n[robustez] Limpieza automática");
    const [vieja, reciente] = await prisma.solicitudPedido.findMany({ where: { mesaId: mesaTope.id, estado: "PENDIENTE" }, take: 2 });
    await prisma.solicitudPedido.update({ where: { id: vieja.id }, data: { creadaEn: new Date(Date.now() - 2 * 60 * 60_000) } });
    const notifVieja = await prisma.notificacion.create({
      data: { userId: t.meseroId, tipo: "SOLICITUD_PEDIDO_CLIENTE", mensaje: "E2E-B- vieja", creadaEn: new Date(Date.now() - 8 * 24 * 60 * 60_000) },
    });
    await ejecutarLimpieza();
    const viejaDespues = await prisma.solicitudPedido.findUnique({ where: { id: vieja.id } });
    verificar(viejaDespues?.estado === "DESCARTADA" && viejaDespues.resueltaPorId === null, "pedido QR de hace 2 h vencido solo");
    verificar((await prisma.solicitudPedido.findUnique({ where: { id: reciente.id } }))?.estado === "PENDIENTE", "uno reciente sigue pendiente");
    verificar((await prisma.notificacion.count({ where: { id: notifVieja.id } })) === 0, "notificación de hace 8 días borrada");
  } finally {
    for (const s of socketsAbiertos) s.close();
    await limpiar(creados);
  }
}
