import { prisma } from "../../src/lib/prisma";
import { ejecutarLimpieza } from "../../src/services/limpieza";
import { despachar, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

const seguir = async (codigo: string) => (await req("GET", `/seguimiento/${codigo}`)).data;
const cerca = (a: string | Date, b: Date, ms = 90_000) => Math.abs(new Date(a).getTime() - b.getTime()) < ms;

// Página pública de seguimiento, hora estimada y manejo de datos personales
// (autorización y borrado del teléfono, Ley 1581).
export async function probarSeguimiento() {
  const creados = registroDeCreados("E2E-D-");
  creados.textos.push("Laura E2E Gómez", "Reciente E2E");
  try {
    const t = await sesiones();
    const productos = (await req("GET", "/productos", undefined, t.mesero)).data.filter((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);
    const [A, B] = [...productos].sort((a, b) => a.tiempoPreparacionMinutos - b.tiempoPreparacionMinutos).slice(-2);
    const items = [{ productoId: A.id, cantidad: 1 }, { productoId: B.id, cantidad: 2 }];
    const maxMin = Math.max(A.tiempoPreparacionMinutos, B.tiempoPreparacionMinutos);

    console.log("[seguimiento] Autorización de datos en mostrador");
    const base = { mesaId: null, nombreCliente: "Laura E2E Gómez", telefonoCliente: "3001234567", items };
    const sinAutorizar = await req("POST", "/solicitudes", base);
    verificar(sinAutorizar.status === 400 && typeof sinAutorizar.data?.error === "string", `sin autorizar → 400 "${sinAutorizar.data?.error}"`);
    const sol = (await req("POST", "/solicitudes", { ...base, aceptaDatos: true })).data;
    creados.solicitudes.push(sol.id);
    verificar(Boolean((await prisma.solicitudPedido.findUnique({ where: { id: sol.id } }))?.datosAutorizadosEn), "queda fechada la autorización");
    verificar(/^[A-Za-z0-9_-]{12}$/.test(sol.codigoSeguimiento ?? ""), "código de seguimiento aleatorio");

    console.log("\n[seguimiento] Pedido de mostrador de principio a fin");
    let s = await seguir(sol.codigoSeguimiento);
    verificar(s.etapa === "ESPERANDO_CONFIRMACION" && s.nombre === "Laura G.", `esperando en caja, nombre abreviado ("${s.nombre}")`);
    verificar(!JSON.stringify(s).includes("3001234567"), "el teléfono no aparece en la página pública");
    verificar(s.minutosPreparacion === maxMin, `tiempo aproximado antes de pagar: ${s.minutosPreparacion} min`);
    const cobro = (await req("PUT", `/solicitudes/${sol.id}/confirmar-recogida`, { metodoPago: "EFECTIVO" }, t.admin)).data;
    creados.pedidos.push(cobro.pedido.id);
    s = await seguir(sol.codigoSeguimiento);
    verificar(s.etapa === "EN_COCINA" && cerca(s.listoEstimadoEn, new Date(new Date(cobro.pedido.creadoEn).getTime() + maxMin * 60_000)), "en cocina, con hora estimada");
    await despachar(cobro.pedido.id, { cocina: t.cocina, entrega: t.admin });
    s = await seguir(sol.codigoSeguimiento);
    verificar(s.etapa === "ENTREGADO", `recogido: ${s.etapa}`);

    console.log("\n[seguimiento] Pedido QR de mesa");
    const mesa = (await req("POST", "/mesas", { numero: "E2E-D-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const solMesa = (await req("POST", "/solicitudes", { mesaId: mesa.id, nombreCliente: "Pedro", telefonoCliente: "3009999999", items })).data;
    verificar((await prisma.solicitudPedido.findUnique({ where: { id: solMesa.id } }))?.telefonoCliente === null, "en mesa no se guarda teléfono");
    s = await seguir(solMesa.codigoSeguimiento);
    verificar(s.canal === "MESA" && s.mesaNumero === "E2E-D-1" && s.etapa === "ESPERANDO_CONFIRMACION", "esperando al mesero en su mesa");
    await req("PUT", `/solicitudes/${solMesa.id}/descartar`, undefined, t.mesero);
    verificar((await seguir(solMesa.codigoSeguimiento)).etapa === "DESCARTADA", "descartada por el mesero");
    verificar((await req("GET", "/seguimiento/no-existe")).status === 404, "código inexistente → 404");

    console.log("\n[seguimiento] El teléfono se borra a los 30 días");
    const hace31 = new Date(Date.now() - 31 * 24 * 60 * 60_000);
    await prisma.solicitudPedido.update({ where: { id: sol.id }, data: { creadaEn: hace31 } });
    await prisma.pedido.update({ where: { id: cobro.pedido.id }, data: { creadoEn: hace31 } });
    const reciente = (await req("POST", "/solicitudes", { ...base, nombreCliente: "Reciente E2E", aceptaDatos: true })).data;
    creados.solicitudes.push(reciente.id);
    await ejecutarLimpieza();
    const vieja = await prisma.solicitudPedido.findUnique({ where: { id: sol.id } });
    const pedidoViejo = await prisma.pedido.findUnique({ where: { id: cobro.pedido.id } });
    verificar(vieja?.telefonoCliente === null && pedidoViejo?.telefonoCliente === null, "de hace 31 días: teléfono borrado");
    verificar(vieja?.nombreCliente === "Laura E2E Gómez", "el nombre se conserva para el registro de la venta");
    verificar((await prisma.solicitudPedido.findUnique({ where: { id: reciente.id } }))?.telefonoCliente === "3001234567", "uno reciente lo conserva");
    // Que no quede en la lista de pedidos por confirmar de caja.
    await req("PUT", `/solicitudes/${reciente.id}/descartar`, undefined, t.admin);
  } finally {
    await limpiar(creados);
  }
}
