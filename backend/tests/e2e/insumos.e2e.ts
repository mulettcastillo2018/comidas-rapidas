import { prisma } from "../../src/lib/prisma";
import { exigir, req, sesiones, supervisorDePrueba, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";

// Inventario por ingrediente: recetas, consumo al vender, devolución al
// cancelar, alertas, compras con costo promedio y conteo físico.
export async function probarInsumos() {
  const creados = registroDeCreados("E2E-P-");
  creados.textos.push("E2E-P");
  try {
    const t = await sesiones();
    const stock = async (id: string) => (await prisma.insumo.findUniqueOrThrow({ where: { id } })).stock;
    const insumo = async (datos: object) => {
      const i = exigir(await req("POST", "/insumos", datos, t.admin), "Crear insumo");
      creados.insumos.push(i.id);
      return i;
    };

    console.log("[insumos] Insumos y recetas");
    verificar((await req("GET", "/insumos", undefined, t.mesero)).status === 403, "solo el admin maneja los insumos");
    const carne = await insumo({ nombre: "E2E-P Carne", unidad: "GRAMO", stockInicial: 1000, stockMinimo: 300, costoUnitario: 30 });
    const pan = await insumo({ nombre: "E2E-P Pan", unidad: "UNIDAD", stockInicial: 10, stockMinimo: 2, costoUnitario: 800 });
    const queso = await insumo({ nombre: "E2E-P Queso", unidad: "GRAMO", stockInicial: 500, stockMinimo: 0, costoUnitario: 40 });
    verificar((await req("POST", "/insumos", { nombre: "E2E-P Carne", unidad: "GRAMO", stockInicial: 0, stockMinimo: 0, costoUnitario: 0 }, t.admin)).status === 409, "no se repite un insumo");

    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const hamburguesa = exigir(await req("POST", "/productos", { nombre: "E2E-P Hamburguesa", descripcion: "prueba", precio: 20000, tiempoPreparacionMinutos: 5, categoriaId }, t.admin), "Producto");
    creados.productos.push(hamburguesa.id);
    const extraQueso = exigir(await req("POST", "/adiciones", { nombre: "E2E-P Extra queso", precio: 3000, costo: null, productoIds: [hamburguesa.id] }, t.admin), "Adición");
    creados.adiciones.push(extraQueso.id);

    verificar((await req("PUT", `/insumos/recetas/${hamburguesa.id}`, { items: [{ insumoId: carne.id, cantidad: 150 }, { insumoId: carne.id, cantidad: 10 }] }, t.admin)).status === 400, "un ingrediente repetido se rechaza");
    const receta = exigir(
      await req("PUT", `/insumos/recetas/${hamburguesa.id}`, { items: [{ insumoId: carne.id, cantidad: 150 }, { insumoId: pan.id, cantidad: 1 }], costoDesdeReceta: true }, t.admin),
      "Receta"
    );
    verificar(receta.costoReceta === 5300 && receta.costo === 5300, `el costo del plato sale de la receta: 150 g × $30 + 1 pan × $800 = ${receta.costo}`);
    exigir(await req("PUT", `/insumos/adiciones/${extraQueso.id}`, { items: [{ insumoId: queso.id, cantidad: 30 }] }, t.admin), "Insumos de la adición");
    verificar((await prisma.adicion.findUniqueOrThrow({ where: { id: extraQueso.id } })).costo === 1200, "y el de la adición, de sus ingredientes");

    console.log("\n[insumos] Consumo al vender y devolución al cancelar");
    const mesa = exigir(await req("POST", "/mesas", { numero: "E2E-P-1", capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Mesa");
    const sesion = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir");
    const pedir = async (cantidad: number, adicionIds: string[] = []) =>
      exigir(await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: hamburguesa.id, cantidad, adicionIds }] }, t.mesero), "Pedido");
    const p1 = await pedir(2, [extraQueso.id]);
    verificar((await stock(carne.id)) === 700 && (await stock(pan.id)) === 8 && (await stock(queso.id)) === 440, "vender 2 con extra queso descuenta 300 g de carne, 2 panes y 60 g de queso");
    verificar((await prisma.pedidoItem.findUniqueOrThrow({ where: { id: p1.items[0].id } })).costoUnitario === 6500, "el costo de la venta incluye el de la adición");
    exigir(await req("PUT", `/pedidos/${p1.id}/items/${p1.items[0].id}/estado`, { estado: "CANCELADO" }, t.mesero), "Cancelar");
    verificar((await stock(carne.id)) === 1000 && (await stock(pan.id)) === 10 && (await stock(queso.id)) === 500, "cancelado antes de cocinarse: todo vuelve");

    const p2 = await pedir(3);
    exigir(await req("PUT", `/pedidos/${p2.id}/items/${p2.items[0].id}/estado`, { estado: "EN_PREPARACION" }, t.cocina), "Cocina empieza");
    const supervisor = await supervisorDePrueba(t.admin, creados);
    exigir(await req("PUT", `/pedidos/${p2.id}/items/${p2.items[0].id}/estado`, { estado: "CANCELADO", pin: supervisor.pin }, t.mesero), "Cancelar con clave");
    verificar((await stock(carne.id)) === 550, "si cocina ya lo empezó, los insumos se gastaron: no vuelven");

    console.log("\n[insumos] Alertas, compras y conteo");
    const antes = new Date();
    await pedir(2);
    verificar((await stock(carne.id)) === 250, "quedan 250 g de carne");
    let aviso = null;
    for (let i = 0; i < 10 && !aviso; i++) {
      aviso = await prisma.notificacion.findFirst({ where: { tipo: "STOCK", mensaje: { contains: "E2E-P Carne" }, creadaEn: { gte: antes } } });
      if (!aviso) await new Promise((r) => setTimeout(r, 300));
    }
    verificar(aviso?.enlace === "/admin/inventario?vista=insumos", `baja del mínimo: aviso al admin ("${aviso?.mensaje}")`);

    const compra = exigir(await req("POST", `/insumos/${carne.id}/compras`, { cantidad: 2000, costoTotal: 70000, registrarGasto: true, desdeCaja: true }, t.admin), "Compra");
    const gasto = await prisma.gasto.findFirst({ where: { concepto: "Compra de E2E-P Carne" }, include: { movimientoCaja: true } });
    if (gasto) creados.gastos.push(gasto.id);
    verificar(compra.stock === 2250 && Math.abs(compra.costoUnitario - 77500 / 2250) < 0.001, `costo promedio: (250 g × $30 + $70.000) / 2.250 g = $${compra.costoUnitario.toFixed(2)}/g`);
    verificar(gasto?.categoria === "INSUMOS" && gasto.monto === 70000 && gasto.movimientoCaja?.tipo === "SALIDA", "la compra queda como gasto de insumos y salida de la caja");
    verificar((await prisma.producto.findUniqueOrThrow({ where: { id: hamburguesa.id } })).costo === Math.round(150 * (77500 / 2250) + 800), "el costo de la hamburguesa se actualiza con el nuevo precio de la carne");
    verificar(!(await prisma.insumo.findUniqueOrThrow({ where: { id: carne.id } })).alertaStockBajo, "con mercancía nueva se quita la alerta");

    exigir(await req("POST", `/insumos/${carne.id}/conteo`, { stockReal: 2000 }, t.admin), "Conteo");
    verificar((await stock(carne.id)) === 2000, "el conteo físico deja lo que de verdad hay");
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const consumo = (await req("GET", `/insumos/consumo?desde=${hoy}&hasta=${hoy}`, undefined, t.admin)).data;
    const fila = consumo.filas.find((f: { insumoId: string }) => f.insumoId === carne.id);
    verificar(fila?.consumo === 750 && fila.compras === 2000 && fila.diferenciaConteo === -250, `consumo de carne: ${fila?.consumo} g vendidos, ${fila?.compras} g comprados, ${fila?.diferenciaConteo} g al contar`);
    verificar(fila?.valorDiferencia === Math.round(-250 * (77500 / 2250)), "la merma se valoriza al costo");
  } finally {
    await limpiar(creados);
  }
}
