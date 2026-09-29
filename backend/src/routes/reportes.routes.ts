import { Router } from "express";
import { z } from "zod";
import type { CanalPedido } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ubicacionDe } from "../lib/ubicacion";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { nombreCompleto } from "../lib/nombre";
import { diaLocal, diaSemanaLocal, esDiaValido, horaLocal, rangoDeDias } from "../lib/fechas";
import { filtroSedes, sedes, sedesDelReporte } from "../services/sedes";

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const reportesRouter = Router();

const MAX_DIAS_REPORTE = 366;

const rangoSchema = z
  .object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) })
  .refine((r) => r.desde <= r.hasta, { message: "La fecha inicial debe ser anterior a la final" });

const personaSelect = { select: { id: true, nombre: true, apellido: true } };

// Ingeniería de menú: cruza qué tanto se vende un producto con cuánto deja
// por unidad, comparado con el resto de la carta.
//   ESTRELLA:     se vende mucho y deja buen margen → cuidarlo.
//   CABALLO:      se vende mucho pero deja poco → subir precio o bajar costo.
//   ROMPECABEZAS: deja buen margen pero se vende poco → promocionarlo.
//   PERRO:        ni se vende ni deja → pensar en sacarlo de la carta.
type ClasificacionMenu = "ESTRELLA" | "CABALLO" | "ROMPECABEZAS" | "PERRO";

function clasificarMenu(productos: { unidadesConCosto: number; ventasConCosto: number; costo: number; clasificacion: ClasificacionMenu | null }[]) {
  const conCosto = productos.filter((p) => p.unidadesConCosto > 0);
  if (conCosto.length < 2) return;
  const unidades = conCosto.reduce((s, p) => s + p.unidadesConCosto, 0);
  // Umbral clásico: 70% de la participación que tendría cada producto si
  // todos se vendieran igual.
  const umbralPopularidad = (unidades / conCosto.length) * 0.7;
  const margenPromedio = conCosto.reduce((s, p) => s + (p.ventasConCosto - p.costo), 0) / unidades;
  for (const p of conCosto) {
    const popular = p.unidadesConCosto >= umbralPopularidad;
    const rentable = (p.ventasConCosto - p.costo) / p.unidadesConCosto >= margenPromedio;
    p.clasificacion = popular ? (rentable ? "ESTRELLA" : "CABALLO") : rentable ? "ROMPECABEZAS" : "PERRO";
  }
}
const itemsConProducto = {
  include: {
    producto: { select: { id: true, nombre: true, categoria: { select: { nombre: true } } } },
    adiciones: { select: { nombre: true, precio: true } },
  },
};

// Ventas de un rango de días (hora de Colombia). Cuenta como venta lo que se
// cobró (factura PAGADA) en esas fechas, según cuándo se cobró; las cuentas
// perdidas y los productos cancelados se reportan aparte, no restan.
reportesRouter.get(
  "/ventas",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = rangoSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica un rango de fechas válido (desde y hasta, formato AAAA-MM-DD)" });
      return;
    }
    const { desde, hasta } = parsed.data;
    const { inicio, fin } = rangoDeDias(desde, hasta);
    const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000);
    if (dias > MAX_DIAS_REPORTE) {
      res.status(400).json({ error: `El rango máximo es de ${MAX_DIAS_REPORTE} días` });
      return;
    }

    // De la sede en la que se está (o de todas, para el administrador general).
    const sedesIds = sedesDelReporte(req);
    const deLaSede = filtroSedes(sedesIds);
    const [facturas, cancelados, pedidosDelRango, visitas, mesasActivas, listaSedes] = await Promise.all([
      prisma.factura.findMany({
        where: { estado: { in: ["PAGADA", "PERDIDA"] }, pagadaEn: { gte: inicio, lt: fin }, ...deLaSede },
        include: {
          cerradaPor: personaSelect,
          autorizadaPor: personaSelect,
          descuentoAutorizadoPor: personaSelect,
          pagos: { select: { metodo: true, monto: true } },
          mesaSesion: { include: { mesa: true, mesero: personaSelect, pedidos: { include: { items: itemsConProducto } } } },
          pedido: { include: { mesero: personaSelect, items: itemsConProducto, plataforma: { select: { nombre: true } } } },
        },
        orderBy: { pagadaEn: "asc" },
      }),
      prisma.pedidoItemStatusLog.findMany({
        where: { aEstado: "CANCELADO", cambiadoEn: { gte: inicio, lt: fin }, pedidoItem: { pedido: deLaSede } },
        include: {
          cambiadoPor: personaSelect,
          autorizadoPor: personaSelect,
          pedidoItem: { include: { producto: { select: { nombre: true } }, pedido: { include: { mesaSesion: { include: { mesa: true } } } } } },
        },
        orderBy: { cambiadoEn: "asc" },
      }),
      // Demanda: cuándo llegan los pedidos (no cuándo se cobran).
      prisma.pedido.findMany({
        where: { creadoEn: { gte: inicio, lt: fin }, ...deLaSede },
        select: { creadoEn: true, items: { select: { cantidad: true, precioUnitario: true, estado: true } } },
      }),
      // Rotación: visitas a mesas que terminaron en el rango.
      prisma.mesaSesion.findMany({
        where: { estado: "CERRADA", cerradaEn: { gte: inicio, lt: fin }, mesa: deLaSede },
        select: {
          abiertaEn: true,
          cerradaEn: true,
          mesa: { select: { numero: true } },
          _count: { select: { comensales: true } },
          factura: { select: { estado: true, total: true } },
        },
      }),
      prisma.mesa.count({ where: { activa: true, ...deLaSede } }),
      sedes(),
    ]);
    const nombreDeSede = (id: string) => listaSedes.find((s) => s.id === id)?.nombre ?? "";

    const cuentas = facturas.map((f) => {
      const esMesa = Boolean(f.mesaSesion);
      return {
        id: f.id,
        sedeId: f.sedeId,
        sede: nombreDeSede(f.sedeId),
        fecha: f.pagadaEn!,
        dia: diaLocal(f.pagadaEn!),
        canal: esMesa ? ("MESA" as const) : (f.pedido?.canal ?? "MOSTRADOR"),
        ubicacion: esMesa ? `Mesa ${f.mesaSesion!.mesa.numero}` : f.pedido ? ubicacionDe(f.pedido) : "Mostrador",
        atendidoPor: esMesa ? f.mesaSesion!.mesero : (f.pedido?.mesero ?? f.cerradaPor),
        estado: f.estado as "PAGADA" | "PERDIDA",
        metodoPago: f.metodoPago,
        pagos: f.pagos,
        subtotal: f.subtotal,
        descuento: f.descuentoMonto,
        descuentoMotivo: f.descuentoMotivo,
        descuentoAutorizadoPor: f.descuentoAutorizadoPor ? nombreCompleto(f.descuentoAutorizadoPor) : null,
        propina: f.propinaMonto,
        envio: f.envioMonto,
        comision: f.comisionMonto,
        total: f.total,
        // Quién autorizó con su clave registrarla como perdida.
        autorizadaPor: f.autorizadaPor ? nombreCompleto(f.autorizadaPor) : null,
        items: (esMesa ? f.mesaSesion!.pedidos.flatMap((p) => p.items) : (f.pedido?.items ?? [])).filter((i) => i.estado !== "CANCELADO"),
      };
    });
    const pagadas = cuentas.filter((c) => c.estado === "PAGADA");
    const perdidas = cuentas.filter((c) => c.estado === "PERDIDA");
    const suma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);

    // Todos los días del rango, aunque no haya vendido nada (para que la
    // gráfica no se salte días y se vean los días flojos).
    const porDia = new Map<string, { dia: string; ventas: number; cuentas: number }>();
    for (let t = inicio.getTime(); t < fin.getTime(); t += 86_400_000) {
      const dia = diaLocal(new Date(t));
      porDia.set(dia, { dia, ventas: 0, cuentas: 0 });
    }
    const porMetodo = new Map<string, { metodo: string; ventas: number; cuentas: number }>();
    const porCanal: Record<CanalPedido, { ventas: number; cuentas: number }> = {
      MESA: { ventas: 0, cuentas: 0 },
      MOSTRADOR: { ventas: 0, cuentas: 0 },
      DOMICILIO: { ventas: 0, cuentas: 0 },
      PLATAFORMA: { ventas: 0, cuentas: 0 },
    };
    const porMesero = new Map<string, { meseroId: string; nombre: string; ventas: number; cuentas: number; propinas: number }>();
    // Para comparar sedes (solo tiene sentido viendo todas).
    const porSede = new Map<string, { sedeId: string; nombre: string; ventas: number; cuentas: number; propinas: number }>();
    // La ganancia se calcula solo sobre lo vendido con costo conocido (el
    // costo se guarda al vender; lo vendido antes de configurarlo no cuenta).
    const porProducto = new Map<
      string,
      { productoId: string; nombre: string; categoria: string; cantidad: number; ventas: number; unidadesConCosto: number; ventasConCosto: number; costo: number }
    >();

    for (const c of pagadas) {
      const dia = porDia.get(c.dia)!;
      dia.ventas += c.total;
      dia.cuentas++;
      // Por los pagos, no por la cuenta: una cuenta dividida suma en cada método.
      for (const pago of c.pagos) {
        const m = porMetodo.get(pago.metodo) ?? { metodo: pago.metodo, ventas: 0, cuentas: 0 };
        m.ventas += pago.monto;
        porMetodo.set(pago.metodo, m);
      }
      for (const metodo of new Set(c.pagos.map((p) => p.metodo))) porMetodo.get(metodo)!.cuentas++;
      porCanal[c.canal].ventas += c.total;
      porCanal[c.canal].cuentas++;
      const s = porSede.get(c.sedeId) ?? { sedeId: c.sedeId, nombre: c.sede, ventas: 0, cuentas: 0, propinas: 0 };
      s.ventas += c.total;
      s.cuentas++;
      s.propinas += c.propina;
      porSede.set(c.sedeId, s);
      if (c.canal === "MESA" && c.atendidoPor) {
        const p = porMesero.get(c.atendidoPor.id) ?? { meseroId: c.atendidoPor.id, nombre: nombreCompleto(c.atendidoPor), ventas: 0, cuentas: 0, propinas: 0 };
        p.ventas += c.total;
        p.cuentas++;
        p.propinas += c.propina;
        porMesero.set(c.atendidoPor.id, p);
      }
      for (const item of c.items) {
        const p = porProducto.get(item.productoId) ?? {
          productoId: item.productoId,
          nombre: item.producto.nombre,
          categoria: item.producto.categoria.nombre,
          cantidad: 0,
          ventas: 0,
          unidadesConCosto: 0,
          ventasConCosto: 0,
          costo: 0,
        };
        p.cantidad += item.cantidad;
        p.ventas += item.cantidad * item.precioUnitario;
        if (item.costoUnitario !== null) {
          p.unidadesConCosto += item.cantidad;
          p.ventasConCosto += item.cantidad * item.precioUnitario;
          p.costo += item.cantidad * item.costoUnitario;
        }
        porProducto.set(item.productoId, p);
      }
    }

    const cancelaciones = cancelados.map((log) => {
      const item = log.pedidoItem;
      return {
        id: log.id,
        fecha: log.cambiadoEn,
        producto: item.producto.nombre,
        cantidad: item.cantidad,
        valor: item.cantidad * item.precioUnitario,
        ubicacion: item.pedido.mesaSesion ? `Mesa ${item.pedido.mesaSesion.mesa.numero}` : `Mostrador — ${item.pedido.nombreCliente ?? "cliente"}`,
        canceladoPor: nombreCompleto(log.cambiadoPor),
        autorizadoPor: log.autorizadoPor ? nombreCompleto(log.autorizadoPor) : null,
        // Si ya estaba en preparación o listo, se perdieron insumos (merma).
        yaEnCocina: log.deEstado === "EN_PREPARACION" || log.deEstado === "LISTO",
        costo: item.costoUnitario !== null ? item.cantidad * item.costoUnitario : null,
      };
    });

    const productos = Array.from(porProducto.values()).map((p) => ({
      ...p,
      ganancia: p.unidadesConCosto > 0 ? p.ventasConCosto - p.costo : null,
      margenPct: p.ventasConCosto > 0 ? Math.round(((p.ventasConCosto - p.costo) / p.ventasConCosto) * 1000) / 10 : null,
      clasificacion: null as ClasificacionMenu | null,
    }));
    clasificarMenu(productos);
    const conCosto = productos.filter((p) => p.unidadesConCosto > 0);
    const ventasConCosto = suma(conCosto.map((p) => p.ventasConCosto));
    const costoVentas = suma(conCosto.map((p) => p.costo));
    const descuentos = pagadas.filter((c) => c.descuento > 0);
    const totalDescuentos = suma(descuentos.map((c) => c.descuento));
    const totalComisiones = suma(pagadas.map((c) => c.comision));

    // Combos vendidos (cada combo = un grupo de partes) y adiciones más pedidas.
    const combos = new Map<string, { nombre: string; grupos: Set<string>; ventas: number }>();
    const adiciones = new Map<string, { nombre: string; cantidad: number; ventas: number }>();
    for (const item of pagadas.flatMap((c) => c.items)) {
      if (item.comboGrupo && item.comboNombre) {
        const combo = combos.get(item.comboNombre) ?? { nombre: item.comboNombre, grupos: new Set<string>(), ventas: 0 };
        combo.grupos.add(item.comboGrupo);
        combo.ventas += item.cantidad * item.precioUnitario;
        combos.set(item.comboNombre, combo);
      }
      for (const adicion of item.adiciones) {
        const a = adiciones.get(adicion.nombre) ?? { nombre: adicion.nombre, cantidad: 0, ventas: 0 };
        a.cantidad += item.cantidad;
        a.ventas += item.cantidad * adicion.precio;
        adiciones.set(adicion.nombre, a);
      }
    }

    // Por hora del día y día de la semana (hora de Colombia).
    const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: 0, ventas: 0 }));
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 0].map((dia) => ({ dia, nombre: NOMBRES_DIA[dia], pedidos: 0, ventas: 0, dias: 0 }));
    for (let t = inicio.getTime(); t < fin.getTime(); t += 86_400_000) {
      porDiaSemana.find((d) => d.dia === diaSemanaLocal(new Date(t)))!.dias++;
    }
    for (const pedido of pedidosDelRango) {
      const valor = suma(pedido.items.filter((i) => i.estado !== "CANCELADO").map((i) => i.cantidad * i.precioUnitario));
      const h = porHora[horaLocal(pedido.creadoEn)];
      h.pedidos++;
      h.ventas += valor;
      const d = porDiaSemana.find((x) => x.dia === diaSemanaLocal(pedido.creadoEn))!;
      d.pedidos++;
      d.ventas += valor;
    }

    const minutos = (v: { abiertaEn: Date; cerradaEn: Date | null }) => (v.cerradaEn!.getTime() - v.abiertaEn.getTime()) / 60_000;
    const promedio = (valores: number[]) => (valores.length ? Math.round((suma(valores) / valores.length) * 10) / 10 : null);
    const cobradas = visitas.filter((v) => v.factura?.estado === "PAGADA");
    const porMesa = new Map<string, { mesa: string; veces: number; minutos: number[]; ventas: number }>();
    for (const v of visitas) {
      const m = porMesa.get(v.mesa.numero) ?? { mesa: v.mesa.numero, veces: 0, minutos: [], ventas: 0 };
      m.veces++;
      m.minutos.push(minutos(v));
      if (v.factura?.estado === "PAGADA") m.ventas += v.factura.total;
      porMesa.set(v.mesa.numero, m);
    }
    const rotacion = {
      mesasAtendidas: visitas.length,
      duracionPromedioMin: promedio(visitas.map(minutos)),
      comensalesPromedio: promedio(visitas.map((v) => v._count.comensales)),
      ticketPromedioMesa: cobradas.length ? Math.round(suma(cobradas.map((v) => v.factura!.total)) / cobradas.length) : null,
      // Cuántos grupos pasa, en promedio, cada mesa en un día.
      vecesPorMesaAlDia: mesasActivas > 0 && dias > 0 ? Math.round((visitas.length / mesasActivas / dias) * 10) / 10 : null,
      porMesa: Array.from(porMesa.values())
        .map((m) => ({ mesa: m.mesa, veces: m.veces, duracionPromedioMin: promedio(m.minutos) ?? 0, ventas: m.ventas }))
        .sort((a, b) => a.mesa.localeCompare(b.mesa, "es", { numeric: true })),
    };

    const ventas = suma(pagadas.map((c) => c.total));
    res.json({
      desde,
      hasta,
      // null = todas las sedes.
      sede: sedesIds ? nombreDeSede(sedesIds[0]) : null,
      resumen: {
        ventas,
        cuentas: pagadas.length,
        ticketPromedio: pagadas.length ? Math.round(ventas / pagadas.length) : 0,
        propinas: suma(pagadas.map((c) => c.propina)),
        perdidas: { cuentas: perdidas.length, total: suma(perdidas.map((c) => c.total)) },
        cancelaciones: {
          productos: suma(cancelaciones.map((c) => c.cantidad)),
          total: suma(cancelaciones.map((c) => c.valor)),
          merma: suma(cancelaciones.filter((c) => c.yaEnCocina).map((c) => c.valor)),
          // Lo que de verdad se perdió en insumos (al costo, no al precio).
          costoMerma: suma(cancelaciones.filter((c) => c.yaEnCocina && c.costo !== null).map((c) => c.costo!)),
        },
        descuentos: { cuentas: descuentos.length, total: totalDescuentos },
        envios: suma(pagadas.map((c) => c.envio)),
        comisiones: totalComisiones,
        ganancia: {
          ventasConCosto,
          costoVentas,
          // Los descuentos, cortesías y comisiones de apps se restan completos
          // (salen de la ganancia).
          descuentos: totalDescuentos,
          comisiones: totalComisiones,
          gananciaBruta: ventasConCosto - costoVentas - totalDescuentos - totalComisiones,
          margenPct:
            ventasConCosto > 0 ? Math.round(((ventasConCosto - costoVentas - totalDescuentos - totalComisiones) / ventasConCosto) * 1000) / 10 : null,
          // Productos vendidos cuya ganancia no se puede calcular por falta de costo.
          productosSinCosto: productos.filter((p) => p.unidadesConCosto < p.cantidad).map((p) => p.nombre),
        },
      },
      porDia: Array.from(porDia.values()),
      porHora,
      porDiaSemana,
      rotacion,
      porMetodo: Array.from(porMetodo.values()).sort((a, b) => b.ventas - a.ventas),
      porCanal,
      porSede: sedesIds ? [] : Array.from(porSede.values()).sort((a, b) => b.ventas - a.ventas),
      porMesero: Array.from(porMesero.values()).sort((a, b) => b.ventas - a.ventas),
      porProducto: productos.sort((a, b) => b.ventas - a.ventas),
      porCombo: Array.from(combos.values())
        .map((c) => ({ nombre: c.nombre, vendidos: c.grupos.size, ventas: c.ventas }))
        .sort((a, b) => b.ventas - a.ventas),
      porAdicion: Array.from(adiciones.values()).sort((a, b) => b.cantidad - a.cantidad),
      perdidas: perdidas.map(({ items: _items, ...c }) => ({ ...c, atendidoPor: nombreCompleto(c.atendidoPor) })),
      cancelaciones,
      cuentas: cuentas.map(({ items: _items, ...c }) => ({ ...c, atendidoPor: nombreCompleto(c.atendidoPor) })),
    });
  })
);

// Opiniones de los clientes (encuesta del QR de la precuenta o del
// seguimiento de un pedido de mostrador).
reportesRouter.get(
  "/satisfaccion",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = rangoSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica un rango de fechas válido (desde y hasta, formato AAAA-MM-DD)" });
      return;
    }
    const { inicio, fin } = rangoDeDias(parsed.data.desde, parsed.data.hasta);
    const sedesIds = sedesDelReporte(req);
    const encuestas = await prisma.encuesta.findMany({
      where: {
        creadaEn: { gte: inicio, lt: fin },
        ...(sedesIds ? { OR: [{ mesaSesion: { mesa: filtroSedes(sedesIds) } }, { solicitud: filtroSedes(sedesIds) }] } : {}),
      },
      include: {
        mesero: { select: { id: true, nombre: true, apellido: true, role: true } },
        mesaSesion: { select: { mesa: { select: { numero: true } } } },
        solicitud: { select: { mesa: { select: { numero: true } } } },
      },
      orderBy: { creadaEn: "desc" },
    });
    const redondear = (v: number) => Math.round(v * 10) / 10;
    const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    for (const e of encuestas) distribucion[e.calificacion]++;
    // Por mesero: solo meseros (en mostrador quien confirma es el admin).
    const porMesero = new Map<string, { meseroId: string; nombre: string; suma: number; opiniones: number }>();
    for (const e of encuestas) {
      if (!e.mesero || e.mesero.role !== "MESERO") continue;
      const m = porMesero.get(e.mesero.id) ?? { meseroId: e.mesero.id, nombre: nombreCompleto(e.mesero), suma: 0, opiniones: 0 };
      m.suma += e.calificacion;
      m.opiniones++;
      porMesero.set(e.mesero.id, m);
    }
    res.json({
      total: encuestas.length,
      promedio: encuestas.length ? redondear(encuestas.reduce((s, e) => s + e.calificacion, 0) / encuestas.length) : null,
      distribucion,
      porMesero: Array.from(porMesero.values())
        .map(({ suma: s, ...m }) => ({ ...m, promedio: redondear(s / m.opiniones) }))
        .sort((a, b) => b.promedio - a.promedio),
      recientes: encuestas.slice(0, 30).map((e) => {
        const mesa = e.mesaSesion?.mesa.numero ?? e.solicitud?.mesa?.numero;
        return {
          id: e.id,
          calificacion: e.calificacion,
          comentario: e.comentario,
          contexto: mesa ? `Mesa ${mesa}` : "Pedido para recoger",
          mesero: e.mesero?.role === "MESERO" ? nombreCompleto(e.mesero) : null,
          creadaEn: e.creadaEn,
        };
      }),
    });
  })
);

// Ahora que cocina despacha producto por producto, el tiempo real se mide
// directamente por PedidoItem (iniciadoEn -> listoEn) — ya no hace falta
// aproximar repartiendo el tiempo del pedido completo entre sus productos.
reportesRouter.get(
  "/tiempos",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const items = await prisma.pedidoItem.findMany({
      where: { iniciadoEn: { not: null }, listoEn: { not: null }, pedido: filtroSedes(sedesDelReporte(req)) },
      include: {
        producto: true,
        pedido: {
          include: {
            mesaSesion: { include: { mesa: true, mesero: { select: { id: true, nombre: true, apellido: true } } } },
            mesero: { select: { id: true, nombre: true, apellido: true } },
            plataforma: { select: { nombre: true } },
          },
        },
      },
      orderBy: { listoEn: "desc" },
      take: 300,
    });

    const filas = items.map((item) => {
      const tiempoRealMinutos = Math.round((item.listoEn!.getTime() - item.iniciadoEn!.getTime()) / 60000);
      return {
        pedidoItemId: item.id,
        // "Mesa 4", "Mostrador — Ana", "Rappi #123 — Luis"...
        mesaNumero: ubicacionDe(item.pedido),
        meseroNombre: nombreCompleto(item.pedido.mesaSesion?.mesero ?? item.pedido.mesero),
        productoNombre: item.producto.nombre,
        creadoEn: item.pedido.creadoEn,
        tiempoEstimadoMinutos: item.tiempoPreparacionMinutos,
        tiempoRealMinutos,
        diferenciaMinutos: tiempoRealMinutos - item.tiempoPreparacionMinutos,
      };
    });

    const promedio = (valores: number[]) => (valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length);
    const resumen = {
      totalItems: filas.length,
      promedioEstimadoMinutos: Math.round(promedio(filas.map((f) => f.tiempoEstimadoMinutos)) * 10) / 10,
      promedioRealMinutos: Math.round(promedio(filas.map((f) => f.tiempoRealMinutos)) * 10) / 10,
      itemsSobreEstimado: filas.filter((f) => f.diferenciaMinutos > 0).length,
    };

    const porProductoMap = new Map<string, { productoId: string; nombre: string; tiempoConfiguradoMinutos: number; muestras: number[] }>();
    for (const item of items) {
      const tiempoRealMinutos = Math.round((item.listoEn!.getTime() - item.iniciadoEn!.getTime()) / 60000);
      const existing = porProductoMap.get(item.productoId);
      if (existing) {
        existing.muestras.push(tiempoRealMinutos);
      } else {
        porProductoMap.set(item.productoId, {
          productoId: item.productoId,
          nombre: item.producto.nombre,
          tiempoConfiguradoMinutos: item.tiempoPreparacionMinutos,
          muestras: [tiempoRealMinutos],
        });
      }
    }
    const porProducto = Array.from(porProductoMap.values()).map((p) => ({
      productoId: p.productoId,
      nombre: p.nombre,
      tiempoConfiguradoMinutos: p.tiempoConfiguradoMinutos,
      promedioRealMinutos: Math.round(promedio(p.muestras) * 10) / 10,
      muestras: p.muestras.length,
    }));

    res.json({ resumen, items: filas, porProducto });
  })
);
