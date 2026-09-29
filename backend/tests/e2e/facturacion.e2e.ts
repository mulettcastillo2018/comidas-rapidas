import { prisma } from "../../src/lib/prisma";
import { despachar, esperar, exigir, req, sesiones, verificar } from "./_utilidades";
import { limpiar, registroDeCreados } from "./_limpieza";
import { iniciarAlanubeFalso, TOKEN_PRUEBA } from "./_alanubeFalso";

// Facturación electrónica contra un Alanube simulado (misma API documentada).
export async function probarFacturacion() {
  const creados = registroDeCreados("E2E-N-");
  creados.textos.push("E2E-N");
  const t = await sesiones();
  const inicio = new Date();
  const original = await prisma.configuracionFiscal.findUnique({ where: { id: "unica" } });
  // La numeración POS y la caja son de la sede (aquí, la principal).
  const principal = await prisma.sede.findFirstOrThrow({ where: { esPrincipal: true } });
  const alanube = await iniciarAlanubeFalso();
  try {
    // Deja que el ciclo en segundo plano termine lo que tenga y procesa ya.
    const procesar = async () => {
      await prisma.documentoFiscal.updateMany({ where: { estado: { in: ["PENDIENTE", "ENVIADO"] }, proximoIntento: { gt: new Date() }, factura: { id: { in: await facturasDePrueba() } } }, data: { proximoIntento: new Date() } });
      exigir(await req("POST", "/facturacion/procesar", undefined, t.admin), "Procesar");
    };
    const facturasDePrueba = async () =>
      (await prisma.factura.findMany({ where: { OR: [{ mesaSesion: { mesa: { numero: { startsWith: "E2E-N-" } } } }, { pedidoId: { in: creados.pedidos } }] }, select: { id: true } })).map((f) => f.id);
    const docsDe = (facturaId: string) => prisma.documentoFiscal.findMany({ where: { facturaId }, orderBy: { creadoEn: "asc" } });
    const hastaQue = async (facturaId: string, condicion: (docs: Awaited<ReturnType<typeof docsDe>>) => boolean) => {
      for (let i = 0; i < 6; i++) {
        await procesar();
        const docs = await docsDe(facturaId);
        if (condicion(docs)) return docs;
        await esperar(300);
      }
      return docsDe(facturaId);
    };

    console.log("[facturación] Configuración");
    verificar((await req("GET", "/facturacion/configuracion", undefined, t.mesero)).status === 403, "solo el admin configura la facturación");
    const configurar = (cambios: object) =>
      req(
        "PUT",
        "/facturacion/configuracion",
        {
          activa: true,
          alanubeUrl: alanube.url,
          alanubeToken: TOKEN_PRUEBA,
          alanubeCompanyId: null,
          nit: "900559088",
          dv: "2",
          razonSocial: "Comidas Rápidas E2E-N SAS",
          documentoPorDefecto: "FACTURA",
          impuesto: "INC",
          impuestoPct: 8,
          feResolucion: null,
          fePrefijo: null,
          feDesde: null,
          feHasta: null,
          feFechaInicio: null,
          feFechaFin: null,
          feClaveTecnica: null,
          feSiguiente: null,
          notaPrefijo: "NC",
          ajustePrefijo: "NA",
          ...cambios,
        },
        t.admin
      );
    verificar((await configurar({ dv: "5" })).status === 400, "un NIT con dígito de verificación equivocado se rechaza");
    verificar((await configurar({ alanubeUrl: "https://otro-servidor.com/api" })).status === 400, "solo se permite la dirección de Alegra (o local en pruebas)");
    const guardada = exigir(await configurar({}), "Configurar");
    verificar(guardada.faltantes.POS.some((f: string) => f.includes("resolución de numeración POS")), "la numeración POS se pide por sede");
    const cajaPos = (cambios: object = {}) =>
      req(
        "PUT",
        `/sedes/${principal.id}`,
        {
          posResolucion: "18764000000001",
          posPrefijo: "POSE",
          posDesde: 1,
          posHasta: 5000,
          posFechaInicio: "2026-01-01",
          posFechaFin: "2027-12-31",
          posSiguiente: null,
          cajaPlaca: "CAJA-E2E",
          cajaUbicacion: "Local principal",
          ...cambios,
        },
        t.admin
      );
    verificar((await cajaPos({ posDesde: 10, posHasta: 5 })).status === 400, "un rango POS al revés se rechaza");
    exigir(await cajaPos(), "Numeración POS de la sede");
    verificar(guardada.token.configurado && guardada.token.final === TOKEN_PRUEBA.slice(-4) && !JSON.stringify(guardada).includes(TOKEN_PRUEBA), "el token se guarda pero nunca se devuelve completo");
    verificar(guardada.faltantes.FACTURA.includes("la compañía en Alanube"), `avisa lo que falta: ${guardada.faltantes.FACTURA.join(", ")}`);
    const conCompania = exigir(await req("POST", "/facturacion/configuracion/compania", undefined, t.admin), "Crear compañía");
    verificar(conCompania.alanubeCompanyId === "compania-e2e", "da de alta la compañía en Alanube y guarda su id");
    const conNumeracion = exigir(await req("POST", "/facturacion/configuracion/numeracion-pruebas", undefined, t.admin), "Numeración de pruebas");
    verificar(conNumeracion.fePrefijo === "SETP" && conNumeracion.feSiguiente >= 990000000 && conNumeracion.faltantes.FACTURA.length === 0, "carga la numeración de pruebas de la DIAN");
    verificar(exigir(await req("POST", "/facturacion/configuracion/probar", undefined, t.admin), "Probar").ok, "la conexión con Alanube funciona");

    const categoriaId = (await req("GET", "/productos", undefined, t.admin)).data[0].categoriaId;
    const producto = exigir(await req("POST", "/productos", { nombre: "E2E-N Hamburguesa", descripcion: "prueba", precio: 21600, tiempoPreparacionMinutos: 5, categoriaId }, t.admin), "Producto");
    creados.productos.push(producto.id);
    let mesas = 0;
    const cobrarMesa = async (cobro: object, propina = 0) => {
      mesas++;
      const mesa = exigir(await req("POST", "/mesas", { numero: `E2E-N-${mesas}`, capacidad: 4, meseroAsignadoId: t.meseroId }, t.admin), "Mesa");
      const sesion = exigir(await req("POST", "/mesa-sesiones", { mesaId: mesa.id, nombreResponsable: "Ana", comensales: ["Ana"] }, t.mesero), "Abrir");
      const pedido = exigir(await req("POST", "/pedidos", { mesaSesionId: sesion.id, items: [{ productoId: producto.id, cantidad: 2 }] }, t.mesero), "Pedido");
      await despachar(pedido.id, { cocina: t.cocina, entrega: t.mesero });
      const cuenta = exigir(await req("POST", "/facturas", { mesaSesionId: sesion.id, propinaMonto: propina }, t.mesero), "Cuenta");
      return { cuenta, pago: await req("PUT", `/facturas/${cuenta.id}/pagar`, cobro, t.mesero) };
    };

    console.log("\n[facturación] Factura electrónica al cobrar una mesa");
    const { cuenta: c1 } = await cobrarMesa({ metodoPago: "EFECTIVO" }, 2000);
    const [f1] = await hastaQue(c1.id, (d) => d[0]?.estado === "ACEPTADO");
    verificar(f1?.tipo === "FACTURA" && f1.estado === "ACEPTADO" && f1.codigoUnico?.startsWith("cufe-") && Boolean(f1.qr), `factura aceptada por la DIAN con CUFE y QR (${f1?.estado} ${f1?.mensaje ?? ""})`);
    const enviada = alanube.recibidos.find((r) => r.cuerpo.number === f1?.numero);
    verificar(enviada?.cuerpo.customer.identificationNumber === "222222222222" && enviada.cuerpo.payments[0].paymentMethod === "10", "a consumidor final, pagada en efectivo");
    verificar(enviada?.cuerpo.totalAmounts.taxTotal === 3200 && enviada.cuerpo.totalAmounts.chargeTotal === 2000 && enviada.cuerpo.totalAmounts.payableTotal === 45200, "INC separado de la carta y la propina como cargo");
    verificar(alanube.recibidos.filter((r) => r.cuerpo.number === f1?.numero).length === 1, "un solo envío por documento");

    console.log("\n[facturación] A nombre del cliente");
    const malDv = await cobrarMesa({ metodoPago: "TARJETA", adquiriente: { tipoIdentificacion: "31", numero: "900559088", dv: "7", nombre: "E2E-N Empresa SAS" } });
    verificar(malDv.pago.status === 400, "un NIT mal digitado frena el cobro (mejor que emitir mal la factura)");
    exigir(await req("PUT", `/facturas/${malDv.cuenta.id}/pagar`, { metodoPago: "TARJETA", adquiriente: { tipoIdentificacion: "31", numero: "900559088", dv: "2", nombre: "E2E-N Empresa SAS", email: "compras@empresa.test" } }, t.mesero), "Pagar con NIT");
    const [f2] = await hastaQue(malDv.cuenta.id, (d) => d[0]?.estado === "ACEPTADO");
    const aNombre = alanube.recibidos.find((r) => r.cuerpo.number === f2?.numero);
    verificar(f2?.clienteNombre === "E2E-N Empresa SAS" && aNombre?.cuerpo.customer.identificationType === "31" && aNombre.cuerpo.customer.dv === "2", "la factura sale a nombre de la empresa, con su NIT");

    console.log("\n[facturación] Documento POS y su anulación");
    exigir(await configurar({ alanubeCompanyId: "compania-e2e", ...soloFe(conNumeracion), feSiguiente: null, documentoPorDefecto: "POS" }), "Pasar a POS");
    const { cuenta: c3 } = await cobrarMesa({ pagos: [{ metodo: "EFECTIVO", monto: 20000 }, { metodo: "NEQUI", monto: 23200 }] });
    const [p1] = await hastaQue(c3.id, (d) => d[0]?.estado === "ACEPTADO");
    const pos = alanube.recibidos.find((r) => r.ruta === "/equivalent-documents/pos" && r.cuerpo.number === String(p1?.numero));
    verificar(p1?.tipo === "POS" && p1.prefijo === "POSE" && pos?.cuerpo.cashRegister.plate === "CAJA-E2E" && p1.codigoUnico?.startsWith("cude-"), "consumidor final → documento equivalente POS con la caja y CUDE");
    verificar(pos?.cuerpo.payments.length === 2, "pago dividido: los dos medios de pago");
    verificar((await req("POST", `/facturacion/documentos/${p1?.id}/anular`, { motivo: "no" }, t.admin)).status === 400, "anular pide el motivo");
    exigir(await req("POST", `/facturacion/documentos/${p1?.id}/anular`, { motivo: "E2E-N error en el cobro" }, t.admin), "Anular POS");
    const conNota = await hastaQue(c3.id, (d) => d.find((x) => x.tipo === "NOTA_AJUSTE")?.estado === "ACEPTADO");
    const nota = conNota.find((x) => x.tipo === "NOTA_AJUSTE");
    const notaEnviada = alanube.recibidos.find((r) => r.ruta === "/adjustment-note-equivalent-documents");
    verificar(nota?.estado === "ACEPTADO" && nota.anulaId === p1?.id && notaEnviada?.cuerpo.documentReference.cude === p1?.codigoUnico && notaEnviada.cuerpo.discrepancy.responseCode === 2, "la nota de ajuste anula el POS (referencia su CUDE)");
    verificar((await req("POST", `/facturacion/documentos/${p1?.id}/anular`, { motivo: "otra vez" }, t.admin)).status === 409, "no se anula dos veces");

    console.log("\n[facturación] Sin conexión y rechazo de la DIAN");
    alanube.caido = 1;
    const { cuenta: c4 } = await cobrarMesa({ metodoPago: "EFECTIVO" });
    // Tras el cobro se intenta enviar solo; aquí se mira sin forzar reintentos.
    let caido = (await docsDe(c4.id))[0];
    for (let i = 0; i < 40 && !caido?.mensaje; i++) {
      await esperar(500);
      caido = (await docsDe(c4.id))[0];
    }
    verificar(caido?.estado === "PENDIENTE" && Boolean(caido.mensaje), `si Alanube no responde, el cobro sigue y el documento queda pendiente ("${caido?.mensaje}")`);
    const [recuperado] = await hastaQue(c4.id, (d) => d[0]?.estado === "ACEPTADO");
    verificar(recuperado?.estado === "ACEPTADO", "cuando vuelve la conexión, se envía solo");

    const aNombreDe = await req("PUT", `/facturacion/cuentas/${c4.id}/adquiriente`, { tipoIdentificacion: "13", numero: "1234567890", nombre: "E2E-N RECHAZAR Pérez" }, t.admin);
    verificar(aNombreDe.status === 201, "después de pagar, el cliente pide la factura a su nombre");
    const tras = await hastaQue(c4.id, (d) => d.some((x) => x.tipo === "FACTURA" && x.clienteNombre.includes("RECHAZAR") && x.estado === "RECHAZADO"));
    const posAnulado = tras.find((x) => x.id === recuperado?.id);
    const rechazada = tras.find((x) => x.clienteNombre.includes("RECHAZAR") && x.tipo === "FACTURA");
    verificar(tras.some((x) => x.tipo === "NOTA_AJUSTE" && x.anulaId === posAnulado?.id), "se anula el POS a consumidor final...");
    verificar(rechazada?.estado === "RECHAZADO" && rechazada.errores.some((e) => e.includes("FAK24")), "...y la DIAN rechaza la nueva factura: queda con el motivo");
    const aviso = await prisma.notificacion.findFirst({ where: { tipo: "FACTURACION", mensaje: { contains: `${rechazada?.prefijo}${rechazada?.numero}` } } });
    verificar(aviso?.enlace === `/admin/facturacion?documento=${rechazada?.id}`, "el admin recibe el aviso y lo lleva al documento");
    exigir(await req("POST", `/facturacion/documentos/${rechazada?.id}/reenviar`, undefined, t.admin), "Reenviar");
    const reenviada = (await hastaQue(c4.id, (d) => d.find((x) => x.id === rechazada?.id)?.estado === "ACEPTADO")).find((x) => x.id === rechazada?.id);
    verificar(reenviada?.estado === "ACEPTADO" && reenviada.numero === rechazada?.numero, "corregido y reenviado con el mismo número: aceptado");

    console.log("\n[facturación] Numeración");
    const siguientePos = (await prisma.sede.findUniqueOrThrow({ where: { id: principal.id } })).posSiguiente!;
    exigir(await cajaPos({ posHasta: siguientePos - 1, posSiguiente: siguientePos }), "Agotar POS");
    const { cuenta: c5, pago: p5 } = await cobrarMesa({ metodoPago: "EFECTIVO" });
    verificar(p5.status === 200, "con la numeración agotada, el cobro igual se registra");
    await procesar();
    verificar((await docsDe(c5.id)).length === 0, "pero no se emite ningún documento");
    const agotada = await prisma.notificacion.findFirst({ where: { tipo: "FACTURACION", mensaje: { contains: "Se acabó la numeración" }, creadaEn: { gte: inicio } } });
    verificar(Boolean(agotada), "y se avisa al admin que pida una nueva resolución");
    const lista = (await req("GET", "/facturacion/documentos", undefined, t.admin)).data;
    verificar(lista.documentos.some((d: { ubicacion: string }) => d.ubicacion.startsWith("Mesa E2E-N-")) && lista.porEstado.ACEPTADO >= 5, "la lista muestra los documentos con su mesa y estado");
    const detalle = (await req("GET", `/facturacion/documentos/${f1?.id}`, undefined, t.admin)).data;
    verificar(detalle.emisor.nit === "900559088" && detalle.contenido.items.length === 1 && detalle.codigoUnico === f1?.codigoUnico, "el detalle trae lo necesario para imprimir la representación gráfica");
  } finally {
    await alanube.cerrar();
    // Deja la configuración como estaba y quita los avisos de la prueba.
    if (original) {
      const { id: _id, ...datos } = original;
      await prisma.configuracionFiscal.update({ where: { id: "unica" }, data: datos });
    } else {
      await prisma.configuracionFiscal.deleteMany({ where: { id: "unica" } });
    }
    const { id: _sede, creadoEn: _creado, ...sede } = principal;
    await prisma.sede.update({ where: { id: principal.id }, data: sede });
    await prisma.notificacion.deleteMany({ where: { tipo: "FACTURACION", creadaEn: { gte: inicio } } });
    await limpiar(creados);
  }
}

// Los campos de la numeración de facturas de una respuesta de configuración.
function soloFe(c: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith("fe")));
}
