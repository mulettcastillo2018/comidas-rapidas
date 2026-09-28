import { prisma } from "../../src/lib/prisma";
import { despachar, exigir, req, sesiones, supervisorDePrueba, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

const hora = (iso: string) => new Date(iso);

// "HH:00" dentro de n horas, en hora de Colombia (para una promoción que no
// esté vigente ahora).
function horaColombiaEn(n: number) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return `${String((h + n) % 24).padStart(2, "0")}:00`;
}

// Adiciones con precio, combos, promociones por horario y descuentos en la
// cuenta con autorización.
export async function probarOfertas() {
  const creados = registroDeCreados("E2E-K-");
  creados.textos.push("E2E-K");
  try {
    const t = await sesiones();
    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const crearProducto = async (nombre: string, precio: number, costo: number, requiereCocina = true) => {
      const p = exigir(await req("POST", "/productos", { nombre: `E2E-K ${nombre}`, descripcion: "prueba", precio, costo, tiempoPreparacionMinutos: 5, categoriaId, requiereCocina }, t.admin), "Crear producto");
      creados.productos.push(p.id);
      return p;
    };
    const hamburguesa = await crearProducto("Hamburguesa", 20000, 8000);
    const papas = await crearProducto("Papas", 6000, 2000);
    const gaseosa = await crearProducto("Gaseosa", 4000, 1500, false);
    const crearAdicion = async (nombre: string, precio: number, costo: number | null, productoIds: string[]) => {
      const a = exigir(await req("POST", "/adiciones", { nombre: `E2E-K ${nombre}`, precio, costo, productoIds }, t.admin), "Crear adición");
      creados.adiciones.push(a.id);
      return a;
    };
    const queso = await crearAdicion("Extra queso", 3000, 1000, [hamburguesa.id]);
    const sinCebolla = await crearAdicion("Sin cebolla", 0, null, [hamburguesa.id]);
    const mesa = exigir(await req("POST", "/mesas", { numero: "E2E-K-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Mesa");
    const sesion = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir");
    const pedir = (items: object[]) => req("POST", "/pedidos", { mesaSesionId: sesion.id, items }, t.mesero);
    const pedidos: string[] = [];

    console.log("[ofertas] Adiciones");
    const deMesero = (await req("GET", "/adiciones", undefined, t.mesero)).data;
    verificar(deMesero.some((a: { id: string }) => a.id === queso.id) && !JSON.stringify(deMesero).includes("costo"), "el mesero ve las adiciones, sin su costo");
    const enLista = (await req("GET", "/productos", undefined, t.mesero)).data.find((p: { id: string }) => p.id === hamburguesa.id);
    verificar(enLista?.adiciones?.length === 2, "cada producto trae las adiciones que se le pueden poner");
    const conAdiciones = exigir(await pedir([{ productoId: hamburguesa.id, cantidad: 2, adicionIds: [queso.id, sinCebolla.id] }]), "Pedido con adiciones");
    pedidos.push(conAdiciones.id);
    const lineaHamb = conAdiciones.items[0];
    verificar(lineaHamb.precioUnitario === 23000 && lineaHamb.adiciones.length === 2, `precio con adiciones: ${lineaHamb.precioUnitario}`);
    verificar((await prisma.pedidoItem.findUnique({ where: { id: lineaHamb.id } }))?.costoUnitario === 9000, "el costo suma el de las adiciones");
    const noAplica = await pedir([{ productoId: papas.id, cantidad: 1, adicionIds: [queso.id] }]);
    verificar(noAplica.status === 400, `una adición que no aplica a ese producto → 400 "${noAplica.data?.error}"`);

    console.log("\n[ofertas] Combos");
    const combo = exigir(
      await req("POST", "/productos", {
        nombre: "E2E-K Combo", descripcion: "prueba", precio: 27000, tiempoPreparacionMinutos: 5, categoriaId, esCombo: true,
        componentes: [{ productoId: hamburguesa.id, cantidad: 1 }, { productoId: papas.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }],
      }, t.admin),
      "Crear combo"
    );
    creados.productos.push(combo.id);
    const comboDeCombo = await req("POST", "/productos", { nombre: "E2E-K Mal", descripcion: "x", precio: 1000, tiempoPreparacionMinutos: 1, categoriaId, esCombo: true, componentes: [{ productoId: combo.id, cantidad: 1 }] }, t.admin);
    verificar(comboDeCombo.status === 400, "un combo no puede contener otro combo");
    const unCombo = exigir(await pedir([{ productoId: combo.id, cantidad: 1 }]), "Pedir combo");
    pedidos.push(unCombo.id);
    const partes = unCombo.items;
    const precioDe = (id: string) => partes.find((i: { productoId: string }) => i.productoId === id)?.precioUnitario;
    verificar(partes.length === 3 && new Set(partes.map((i: { comboGrupo: string }) => i.comboGrupo)).size === 1, "el combo queda como sus 3 partes, del mismo grupo");
    verificar(precioDe(hamburguesa.id) === 18000 && precioDe(papas.id) === 5400 && precioDe(gaseosa.id) === 3600, "el precio del combo se reparte según el precio de cada parte (18.000 + 5.400 + 3.600)");
    verificar(partes.find((i: { productoId: string }) => i.productoId === gaseosa.id)?.estado === "LISTO", "la gaseosa del combo nace lista (no pasa por cocina)");
    const dosCombos = exigir(await pedir([{ productoId: combo.id, cantidad: 2 }]), "Pedir 2 combos");
    pedidos.push(dosCombos.id);
    verificar(dosCombos.items.length === 6 && new Set(dosCombos.items.map((i: { comboGrupo: string }) => i.comboGrupo)).size === 2, "2 combos = 6 partes en 2 grupos");
    await req("PUT", `/productos/${gaseosa.id}/disponible`, { disponible: false }, t.cocina);
    const comboAgotado = await pedir([{ productoId: combo.id, cantidad: 1 }]);
    verificar(comboAgotado.status === 409 && /Gaseosa/.test(comboAgotado.data?.error), `si se agota una parte, el combo no se puede pedir: "${comboAgotado.data?.error}"`);
    await req("PUT", `/productos/${gaseosa.id}/disponible`, { disponible: true }, t.cocina);

    console.log("\n[ofertas] Promociones");
    verificar((await req("POST", "/promociones", { nombre: "x", descuentoPct: 10 }, t.admin)).status === 400, "una promoción sin productos ni categorías se rechaza");
    verificar((await req("POST", "/promociones", { nombre: "x", descuentoPct: 10, productoIds: [papas.id], horaInicio: "5pm" }, t.admin)).status === 400, "hora con formato inválido se rechaza");
    const horaFeliz = exigir(await req("POST", "/promociones", { nombre: "E2E-K Hora feliz", descuentoPct: 20, productoIds: [papas.id] }, t.admin), "Promo vigente");
    creados.promociones.push(horaFeliz.id);
    const masTarde = exigir(
      await req("POST", "/promociones", { nombre: "E2E-K Más tarde", descuentoPct: 50, productoIds: [hamburguesa.id], horaInicio: horaColombiaEn(2), horaFin: horaColombiaEn(3) }, t.admin),
      "Promo futura"
    );
    creados.promociones.push(masTarde.id);
    const lista = (await req("GET", "/promociones", undefined, t.admin)).data;
    verificar(lista.find((p: { id: string }) => p.id === horaFeliz.id)?.vigente && !lista.find((p: { id: string }) => p.id === masTarde.id)?.vigente, "se sabe cuál aplica ahora y cuál no");
    const papasEnCarta = (await req("GET", "/carta")).data.flatMap((c: { productos: object[] }) => c.productos).find((p: { id: string }) => p.id === papas.id);
    verificar(papasEnCarta?.promocion?.precio === 4800, "la carta muestra el precio con descuento");
    const conPromo = exigir(await pedir([{ productoId: papas.id, cantidad: 1 }, { productoId: hamburguesa.id, cantidad: 1 }]), "Pedido con promo");
    pedidos.push(conPromo.id);
    const lineaPapas = conPromo.items.find((i: { productoId: string }) => i.productoId === papas.id);
    const lineaHamb2 = conPromo.items.find((i: { productoId: string }) => i.productoId === hamburguesa.id);
    verificar(lineaPapas.precioUnitario === 4800 && lineaPapas.precioLista === 6000 && lineaPapas.promocionNombre === "E2E-K Hora feliz", "la promoción vigente se aplica al pedir");
    verificar(lineaHamb2.precioUnitario === 20000 && !lineaHamb2.promocionNombre, "la que no es de esta hora no se aplica");

    console.log("\n[ofertas] Pedido del cliente por QR con adiciones y promoción");
    const solicitud = exigir(
      await req("POST", "/solicitudes", {
        mesaId: mesa.id,
        items: [
          { productoId: hamburguesa.id, cantidad: 1, adicionIds: [queso.id] },
          { productoId: papas.id, cantidad: 2 },
        ],
      }),
      "Solicitud por QR"
    );
    creados.solicitudes.push(solicitud.id);
    const [sHamb, sPapas] = solicitud.items;
    verificar(sHamb.adiciones?.[0]?.nombre === "E2E-K Extra queso" && sHamb.precioEstimado === 23000, "la solicitud muestra las adiciones y el precio con ellas");
    verificar(sPapas.precioEstimado === 4800, "y el precio con la promoción vigente");
    verificar(!JSON.stringify(solicitud).includes("costo"), "sin costos en la respuesta pública");
    const pendientes = (await req("GET", `/solicitudes?mesaId=${mesa.id}`, undefined, t.mesero)).data;
    verificar(pendientes[0]?.items[0]?.precioEstimado === 23000, "el mesero la ve con el mismo precio");
    const seguimiento = (await req("GET", `/seguimiento/${solicitud.codigoSeguimiento}`)).data;
    verificar(seguimiento.items.some((i: { nombre: string }) => i.nombre === "E2E-K Hamburguesa + E2E-K Extra queso"), "el seguimiento del cliente muestra la adición antes de confirmar");
    const confirmada = exigir(await req("PUT", `/solicitudes/${solicitud.id}/confirmar`, undefined, t.mesero), "Confirmar solicitud");
    pedidos.push(confirmada.pedido.id);
    verificar(confirmada.pedido.items.find((i: { productoId: string }) => i.productoId === hamburguesa.id)?.precioUnitario === 23000, "al confirmarla se cobra lo que se le mostró");

    console.log("\n[ofertas] Descuento en la cuenta");
    for (const id of pedidos) await despachar(id, { cocina: t.cocina, entrega: t.mesero });
    const items = await prisma.pedidoItem.findMany({ where: { pedidoId: { in: pedidos } } });
    const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
    const descuento = { tipo: "PORCENTAJE", valor: 10, motivo: "E2E-K cumpleaños" };
    const supervisor = await supervisorDePrueba(t.admin, creados);
    const sinClave = await req("POST", "/facturas", { mesaSesionId: sesion.id, propinaMonto: 5000, descuento }, t.mesero);
    verificar(sinClave.status === 428, `un descuento del mesero pide la clave de un admin (${sinClave.status})`);
    const cuenta = exigir(await req("POST", "/facturas", { mesaSesionId: sesion.id, propinaMonto: 5000, descuento, pin: supervisor.pin }, t.mesero), "Cuenta con descuento");
    const esperado = Math.round(subtotal * 0.1);
    verificar(cuenta.descuentoMonto === esperado && cuenta.total === subtotal - esperado + 5000, `10% de ${subtotal} = ${cuenta.descuentoMonto}; total ${cuenta.total}`);
    verificar((await prisma.factura.findUnique({ where: { id: cuenta.id } }))?.descuentoAutorizadoPorId === supervisor.id, "queda quién autorizó el descuento");
    exigir(await req("PUT", `/facturas/${cuenta.id}/pagar`, { metodoPago: "EFECTIVO" }, t.mesero), "Pagar");

    console.log("\n[ofertas] Reporte: combos, adiciones y descuentos");
    await prisma.factura.update({ where: { id: cuenta.id }, data: { pagadaEn: hora("2020-04-07T20:00:00-05:00") } });
    const r = (await req("GET", "/reportes/ventas?desde=2020-04-07&hasta=2020-04-07", undefined, t.admin)).data;
    const comboR = r.porCombo.find((c: { nombre: string }) => c.nombre === "E2E-K Combo");
    verificar(comboR?.vendidos === 3 && comboR.ventas === 81000, `combos vendidos: ${comboR?.vendidos} por ${comboR?.ventas}`);
    const quesoR = r.porAdicion.find((a: { nombre: string }) => a.nombre === "E2E-K Extra queso");
    verificar(quesoR?.cantidad === 3 && quesoR.ventas === 9000, `adiciones más pedidas: ${quesoR?.cantidad} por ${quesoR?.ventas}`);
    verificar(r.resumen.descuentos.total === esperado && r.resumen.ganancia.descuentos === esperado, "los descuentos se ven y se restan de la ganancia");
    const cuentaR = r.cuentas.find((c: { id: string }) => c.id === cuenta.id);
    verificar(cuentaR?.descuentoMotivo === "E2E-K cumpleaños" && Boolean(cuentaR?.descuentoAutorizadoPor), "el reporte dice el motivo y quién autorizó el descuento");
    const g = r.resumen.ganancia;
    verificar(g.gananciaBruta === g.ventasConCosto - g.costoVentas - esperado, "ganancia = ventas − costo − descuentos");
  } finally {
    await limpiar(creados);
  }
}
