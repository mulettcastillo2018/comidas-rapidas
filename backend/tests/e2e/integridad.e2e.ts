import { prisma } from "../../src/lib/prisma";
import { conectar, despachar, estados, login, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Operaciones simultáneas que antes podían duplicar o romper datos, y
// cortar el acceso de un usuario al desactivarlo o cambiarle el rol.
export async function probarIntegridad() {
  const creados = registroDeCreados("E2E-A-");
  creados.textos.push("Prueba Mostrador E2E");
  try {
    const t = await sesiones();
    const mesa = (await req("POST", "/mesas", { numero: "E2E-A-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin)).data;
    const producto = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { disponible: boolean; requiereCocina: boolean }) => p.disponible && p.requiereCocina);

    console.log("[integridad] Dos meseros abren la misma mesa a la vez");
    const aperturas = await Promise.all([1, 2].map(() => req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Prueba", comensales: ["Prueba"] }, t.mesero)));
    verificar(estados(aperturas) === "201,409", `una abre y la otra es rechazada (${estados(aperturas)})`);
    const sesion = aperturas.find((r) => r.status === 201)!.data;
    verificar((await prisma.mesaSesion.count({ where: { mesaId: mesa.id, estado: { not: "CERRADA" } } })) === 1, "quedó exactamente 1 sesión abierta");

    console.log("\n[integridad] Dos confirmaciones simultáneas del mismo pedido del cliente");
    const solicitud = (await req("POST", "/solicitudes", { mesaId: mesa.id, items: [{ productoId: producto.id, cantidad: 1 }] })).data;
    const confirmaciones = await Promise.all([1, 2].map(() => req("PUT", `/solicitudes/${solicitud.id}/confirmar`, undefined, t.mesero)));
    verificar(estados(confirmaciones) === "200,409", `una confirma y la otra es rechazada (${estados(confirmaciones)})`);
    verificar((await prisma.pedido.count({ where: { mesaSesionId: sesion.id, origenCliente: true } })) === 1, "se creó exactamente 1 pedido");
    const pedido = confirmaciones.find((r) => r.status === 200)!.data.pedido;
    const itemId = pedido.items[0].id;

    console.log("\n[integridad] Pedir la cuenta con un producto todavía en cocina");
    const prematura = await req("POST", "/facturas", { mesaSesionId: sesion.id }, t.mesero);
    verificar(prematura.status === 409 && /sin entregar/.test(prematura.data?.error ?? ""), `rechazada: "${prematura.data?.error}"`);
    verificar((await prisma.mesaSesion.findUnique({ where: { id: sesion.id } }))?.estado === "ABIERTA", "la mesa sigue ABIERTA");

    for (const [estado, token] of [["EN_PREPARACION", t.cocina], ["LISTO", t.cocina], ["ENTREGADO", t.mesero]]) {
      await req("PUT", `/pedidos/${pedido.id}/items/${itemId}/estado`, { estado }, token);
    }

    console.log("\n[integridad] Dos solicitudes de cuenta simultáneas");
    const cuentas = await Promise.all([1, 2].map(() => req("POST", "/facturas", { mesaSesionId: sesion.id }, t.mesero)));
    verificar(estados(cuentas) === "201,409", `una se genera y la otra es rechazada, sin error 500 (${estados(cuentas)})`);
    const factura = cuentas.find((r) => r.status === 201)!.data;
    const tarde = await req("PUT", `/pedidos/${pedido.id}/items/${itemId}/estado`, { estado: "CANCELADO" }, t.mesero);
    verificar(tarde.status === 409, `cancelar después de generar la cuenta: rechazado (${tarde.status})`);

    console.log("\n[integridad] Pagar y 'se fue sin pagar' al mismo tiempo");
    const cierres = await Promise.all([
      req("PUT", `/facturas/${factura.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero),
      req("PUT", `/facturas/${factura.id}/marcar-perdida`, undefined, t.mesero),
    ]);
    verificar(estados(cierres) === "200,409", `solo uno se aplica (${estados(cierres)})`);
    verificar((await prisma.mesa.findUnique({ where: { id: mesa.id } }))?.estado === "LIBRE", "la mesa quedó libre");

    console.log("\n[integridad] Dos cobros simultáneos del mismo pedido de mostrador");
    const mostrador = (await req("POST", "/solicitudes", {
      mesaId: null,
      nombreCliente: "Prueba Mostrador E2E",
      telefonoCliente: "3000000000",
      aceptaDatos: true,
      items: [{ productoId: producto.id, cantidad: 1 }],
    })).data;
    creados.solicitudes.push(mostrador.id);
    const cobros = await Promise.all([1, 2].map(() => req("PUT", `/solicitudes/${mostrador.id}/confirmar-recogida`, { metodoPago: "TARJETA" }, t.admin)));
    verificar(estados(cobros) === "200,409", `uno se cobra y el otro es rechazado (${estados(cobros)})`);
    const cobro = cobros.find((r) => r.status === 200)!.data;
    creados.pedidos.push(cobro.pedido.id);
    verificar((await prisma.factura.count({ where: { pedidoId: cobro.pedido.id } })) === 1, "1 pedido con exactamente 1 cuenta pagada");
    await despachar(cobro.pedido.id, { cocina: t.cocina, entrega: t.admin });

    console.log("\n[integridad] Desactivar un usuario le quita el acceso al instante");
    const temporal = (await req("POST", "/usuarios", {
      nombre: "Temporal",
      apellido: "E2E",
      email: `temporal_${Date.now()}@comidasrapidas.test`,
      password: process.env.E2E_PASSWORD,
      role: "MESERO",
    }, t.admin)).data;
    creados.usuarios.push(temporal.id);
    const tokenTemporal = await login(temporal.email);
    verificar((await req("GET", "/mesas", undefined, tokenTemporal)).status === 200, "antes: acceso normal");
    const socket = await conectar(tokenTemporal);
    const desconexion = new Promise((resolve) => socket.on("disconnect", resolve));
    await req("PUT", `/usuarios/${temporal.id}/active`, { isActive: false }, t.admin);
    const tras = await req("GET", "/mesas", undefined, tokenTemporal);
    verificar(tras.status === 401, `mismo token, ahora 401: "${tras.data?.error}"`);
    const motivo = await Promise.race([desconexion, new Promise((r) => setTimeout(() => r("sin desconexión"), 5000))]);
    verificar(motivo === "io server disconnect", `su conexión en vivo se cortó (${motivo})`);
    socket.close();

    console.log("\n[integridad] Cambiar el rol invalida el token anterior");
    await req("PUT", `/usuarios/${temporal.id}/active`, { isActive: true }, t.admin);
    const tokenReactivado = await login(temporal.email);
    await req("PUT", `/usuarios/${temporal.id}/role`, { role: "COCINA" }, t.admin);
    const trasRol = await req("GET", "/mesas", undefined, tokenReactivado);
    verificar(trasRol.status === 401, `token con el rol viejo, ahora 401: "${trasRol.data?.error}"`);
  } finally {
    await limpiar(creados);
  }
}
