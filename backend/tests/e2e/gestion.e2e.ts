import { prisma } from "../../src/lib/prisma";
import { despachar, exigir, login, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Día de prueba sin movimientos reales (martes).
const DIA = "2020-05-12";
const hora = (hhmm: string, dia = DIA) => new Date(`${dia}T${hhmm}:00-05:00`);

// Gastos, estado de resultados y punto de equilibrio; turnos y reparto de
// propinas.
export async function probarGestion() {
  const creados = registroDeCreados("E2E-M-");
  creados.textos.push("E2E-M");
  const t = await sesiones();
  const configOriginal = (await req("GET", "/configuracion", undefined, t.admin)).data;
  try {
    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const hamburguesa = exigir(
      await req("POST", "/productos", { nombre: "E2E-M Hamburguesa", descripcion: "prueba", precio: 20000, costo: 8000, tiempoPreparacionMinutos: 5, categoriaId }, t.admin),
      "Producto"
    );
    creados.productos.push(hamburguesa.id);
    const mesa = exigir(await req("POST", "/mesas", { numero: "E2E-M-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Mesa");
    const sesion = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir mesa");
    const pedido = exigir(await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: hamburguesa.id, cantidad: 2 }] }, t.mesero), "Pedido");
    await despachar(pedido.id, { cocina: t.cocina, entrega: t.mesero });
    const cuenta = exigir(await req("POST", "/facturas", { mesaSesionId: sesion.id, propinaMonto: 4000 }, t.mesero), "Cuenta");
    exigir(await req("PUT", `/facturas/${cuenta.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero), "Pagar");
    await prisma.factura.update({ where: { id: cuenta.id }, data: { pagadaEn: hora("20:00") } });

    console.log("[gestión] Gastos");
    const gasto = async (datos: object) => {
      const g = exigir(await req("POST", "/gastos", datos, t.admin), "Registrar gasto");
      creados.gastos.push(g.id);
      return g;
    };
    verificar((await req("POST", "/gastos", { dia: DIA, categoria: "ARRIENDO", concepto: "x", monto: 1000 }, t.admin)).status === 400, "el concepto es obligatorio");
    verificar((await req("POST", "/gastos", { dia: "2999-01-01", categoria: "OTROS", concepto: "E2E-M futuro", monto: 1000 }, t.admin)).status === 400, "no se registran gastos a futuro");
    verificar((await req("POST", "/gastos", { dia: DIA, categoria: "OTROS", concepto: "E2E-M viejo", monto: 1000, desdeCaja: true }, t.admin)).status === 400, "solo un gasto de hoy sale de la caja");
    verificar((await req("POST", "/gastos", { dia: DIA, categoria: "OTROS", concepto: "E2E-M mesero", monto: 1000 }, t.mesero)).status === 403, "un mesero no registra gastos");
    await gasto({ dia: DIA, categoria: "ARRIENDO", concepto: "E2E-M arriendo", monto: 10000, esFijo: true });
    await gasto({ dia: DIA, categoria: "INSUMOS", concepto: "E2E-M carne", monto: 20000 });
    await gasto({ dia: DIA, categoria: "PUBLICIDAD", concepto: "E2E-M volantes", monto: 2000 });
    const lista = (await req("GET", `/gastos?desde=${DIA}&hasta=${DIA}`, undefined, t.admin)).data;
    verificar(lista.total === 32000 && lista.porCategoria[0].categoria === "INSUMOS", `gastos del día: ${lista.total}`);

    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const deCaja = await gasto({ dia: hoy, categoria: "OTROS", concepto: "E2E-M bolsas", monto: 1500, desdeCaja: true });
    const movimientos = (await req("GET", "/caja/actual", undefined, t.admin)).data.movimientos;
    const salida = movimientos.find((m: { concepto: string }) => m.concepto === "Gasto: E2E-M bolsas");
    verificar(salida?.tipo === "SALIDA" && salida.monto === 1500, "pagado con la caja: queda como salida del turno");
    verificar((await req("DELETE", `/caja/movimientos/${salida?.id}`, undefined, t.admin)).status === 409, "esa salida se borra desde Gastos, no desde Caja");
    verificar((await req("DELETE", `/gastos/${deCaja.id}`, undefined, t.admin)).status === 204, "borrar el gasto...");
    verificar(!(await prisma.movimientoCaja.findUnique({ where: { id: salida?.id ?? "" } })), "...también borra su salida de caja");

    console.log("\n[gestión] Estado de resultados y punto de equilibrio");
    const r = (await req("GET", `/reportes/resultados?desde=${DIA}&hasta=${DIA}`, undefined, t.admin)).data;
    verificar(r.ingresos.total === 40000 && r.propinas === 4000, "ingresos sin propinas (las propinas son del personal)");
    verificar(r.fuenteCosto === "PRODUCTOS" && r.costoVentas === 16000 && r.comprasInsumos === 20000, "costo según los productos; las compras de insumos quedan como referencia");
    verificar(r.utilidadBruta === 24000 && r.gastos.total === 12000 && r.utilidadNeta === 12000, `utilidad bruta ${r.utilidadBruta}, gastos ${r.gastos.total} (sin contar dos veces los insumos), neta ${r.utilidadNeta}`);
    verificar(r.gastos.fijos === 10000 && r.gastos.variables === 2000, "separa gastos fijos y variables");
    verificar(r.puntoEquilibrio?.margenContribucionPct === 55 && r.puntoEquilibrio.ventasNecesarias === 18182 && r.puntoEquilibrio.alcanzado, `punto de equilibrio: ${r.puntoEquilibrio?.ventasNecesarias}`);

    console.log("\n[gestión] Turnos");
    const cocinaId: string = (await req("GET", "/auth/me", undefined, t.cocina)).data.id;
    const previoMesero = await prisma.turno.findFirst({ where: { userId: t.meseroId, salida: null } });
    if (!previoMesero) {
      const entrada = await req("POST", "/turnos/entrada", undefined, t.mesero);
      if (entrada.status === 201) creados.turnos.push(entrada.data.id);
      verificar(entrada.status === 201, "el mesero marca su entrada");
      verificar((await req("GET", "/turnos/mio", undefined, t.mesero)).data.abierto?.id === entrada.data.id, "ve su turno abierto");
      verificar((await req("POST", "/turnos/entrada", undefined, t.mesero)).status === 409, "no abre dos turnos a la vez");
      verificar((await req("POST", "/turnos/salida", undefined, t.mesero)).status === 200, "marca su salida");
      verificar((await req("POST", "/turnos/salida", undefined, t.mesero)).status === 409, "sin turno abierto no hay salida");
    }
    const otro = exigir(
      await req("POST", "/usuarios", { nombre: "Mesero", apellido: "E2E-M", email: `mesero_m_${Date.now()}@comidasrapidas.test`, password: process.env.E2E_PASSWORD, role: "MESERO" }, t.admin),
      "Otro mesero"
    );
    creados.usuarios.push(otro.id);
    const turno = async (userId: string, entrada: Date, salida: Date) => {
      const sedeId = (await prisma.sede.findFirstOrThrow({ where: { esPrincipal: true } })).id;
      const creado = await prisma.turno.create({ data: { userId, entrada, salida, sedeId } });
      creados.turnos.push(creado.id);
      return creado;
    };
    const turnoMesero = await turno(t.meseroId, hora("12:00"), hora("20:00"));
    await turno(cocinaId, hora("14:00"), hora("20:00"));
    // Cruza la medianoche: en el día de prueba solo cuentan 2 de sus 4 horas.
    await turno(otro.id, hora("22:00"), hora("02:00", "2020-05-13"));
    const lt = (await req("GET", `/turnos?desde=${DIA}&hasta=${DIA}`, undefined, t.admin)).data;
    const horasDe = (id: string) => lt.porPersona.find((p: { userId: string }) => p.userId === id)?.horas;
    verificar(horasDe(t.meseroId) >= 8 && horasDe(otro.id) === 2 && horasDe(cocinaId) >= 6, `horas del día: mesero ${horasDe(t.meseroId)}, otro ${horasDe(otro.id)} (cruza medianoche), cocina ${horasDe(cocinaId)}`);
    verificar((await req("PUT", `/turnos/${turnoMesero.id}`, { entrada: hora("20:00").toISOString(), salida: hora("12:00").toISOString() }, t.admin)).status === 400, "la salida debe ser después de la entrada");
    verificar((await req("PUT", `/turnos/${turnoMesero.id}`, { entrada: hora("12:00").toISOString(), salida: hora("20:00").toISOString() }, t.mesero)).status === 403, "solo el admin corrige turnos");
    const corregido = exigir(await req("PUT", `/turnos/${turnoMesero.id}`, { entrada: hora("12:00").toISOString(), salida: hora("20:00").toISOString() }, t.admin), "Corregir");
    verificar(corregido.editadoPorId !== null, "queda marcado quién lo corrigió");

    console.log("\n[gestión] Reparto de propinas");
    const reparto = async (cambio: object) => {
      exigir(await req("PUT", "/configuracion", cambio, t.admin), "Configurar propinas");
      return (await req("GET", `/reportes/propinas?desde=${DIA}&hasta=${DIA}`, undefined, t.admin)).data;
    };
    const monto = (r: { reparto: { userId: string; monto: number }[] }, id: string) => r.reparto.find((p) => p.userId === id)?.monto ?? 0;
    const propias = await reparto({ propinaPctCocina: 25, propinaModo: "PROPIAS" });
    verificar(propias.total === 4000 && propias.paraCocina === 1000 && monto(propias, cocinaId) === 1000, "cocina se lleva su 25% (quien trabajó ese día)");
    verificar(monto(propias, t.meseroId) === 3000 && monto(propias, otro.id) === 0, "salón: cada mesero lo de sus mesas");
    const pozo = await reparto({ propinaPctCocina: 25, propinaModo: "POZO" });
    verificar(monto(pozo, t.meseroId) === 2400 && monto(pozo, otro.id) === 600, "pozo: el salón se reparte por horas (8 h y 2 h)");
    verificar(pozo.reparto.reduce((s: number, p: { monto: number }) => s + p.monto, 0) === pozo.total, "se reparte exactamente el total");
    verificar((await req("PUT", "/configuracion", { propinaPctCocina: 150, propinaModo: "POZO" }, t.admin)).status === 400, "porcentaje fuera de rango se rechaza");
    verificar((await req("GET", `/reportes/propinas?desde=${DIA}&hasta=${DIA}`, undefined, await login(process.env.E2E_MESERO ?? "mesero2_test@comidasrapidas.test"))).status === 403, "solo el admin ve el reparto");
  } finally {
    if (configOriginal?.propinaModo) await req("PUT", "/configuracion", configOriginal, t.admin);
    await limpiar(creados);
  }
}
