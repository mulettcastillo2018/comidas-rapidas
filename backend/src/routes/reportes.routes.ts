import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { nombreCompleto } from "../lib/nombre";
import { diaLocal, esDiaValido, rangoDeDias } from "../lib/fechas";

export const reportesRouter = Router();

const MAX_DIAS_REPORTE = 366;

const rangoSchema = z
  .object({ desde: z.string().refine(esDiaValido), hasta: z.string().refine(esDiaValido) })
  .refine((r) => r.desde <= r.hasta, { message: "La fecha inicial debe ser anterior a la final" });

const personaSelect = { select: { id: true, nombre: true, apellido: true } };
const itemsConProducto = { include: { producto: { select: { id: true, nombre: true, categoria: { select: { nombre: true } } } } } };

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

    const [facturas, cancelados] = await Promise.all([
      prisma.factura.findMany({
        where: { estado: { in: ["PAGADA", "PERDIDA"] }, pagadaEn: { gte: inicio, lt: fin } },
        include: {
          cerradaPor: personaSelect,
          mesaSesion: { include: { mesa: true, mesero: personaSelect, pedidos: { include: { items: itemsConProducto } } } },
          pedido: { include: { mesero: personaSelect, items: itemsConProducto } },
        },
        orderBy: { pagadaEn: "asc" },
      }),
      prisma.pedidoItemStatusLog.findMany({
        where: { aEstado: "CANCELADO", cambiadoEn: { gte: inicio, lt: fin } },
        include: {
          cambiadoPor: personaSelect,
          pedidoItem: { include: { producto: { select: { nombre: true } }, pedido: { include: { mesaSesion: { include: { mesa: true } } } } } },
        },
        orderBy: { cambiadoEn: "asc" },
      }),
    ]);

    const cuentas = facturas.map((f) => {
      const esMesa = Boolean(f.mesaSesion);
      return {
        id: f.id,
        fecha: f.pagadaEn!,
        dia: diaLocal(f.pagadaEn!),
        canal: esMesa ? ("MESA" as const) : ("MOSTRADOR" as const),
        ubicacion: esMesa ? `Mesa ${f.mesaSesion!.mesa.numero}` : `Mostrador — ${f.pedido?.nombreCliente ?? "cliente"}`,
        atendidoPor: esMesa ? f.mesaSesion!.mesero : (f.pedido?.mesero ?? f.cerradaPor),
        estado: f.estado as "PAGADA" | "PERDIDA",
        metodoPago: f.metodoPago,
        subtotal: f.subtotal,
        propina: f.propinaMonto,
        total: f.total,
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
    const porCanal = { MESA: { ventas: 0, cuentas: 0 }, MOSTRADOR: { ventas: 0, cuentas: 0 } };
    const porMesero = new Map<string, { meseroId: string; nombre: string; ventas: number; cuentas: number; propinas: number }>();
    const porProducto = new Map<string, { productoId: string; nombre: string; categoria: string; cantidad: number; ventas: number }>();

    for (const c of pagadas) {
      const dia = porDia.get(c.dia)!;
      dia.ventas += c.total;
      dia.cuentas++;
      const metodo = c.metodoPago ?? "OTRO";
      const m = porMetodo.get(metodo) ?? { metodo, ventas: 0, cuentas: 0 };
      m.ventas += c.total;
      m.cuentas++;
      porMetodo.set(metodo, m);
      porCanal[c.canal].ventas += c.total;
      porCanal[c.canal].cuentas++;
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
        };
        p.cantidad += item.cantidad;
        p.ventas += item.cantidad * item.precioUnitario;
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
        // Si ya estaba en preparación o listo, se perdieron insumos (merma).
        yaEnCocina: log.deEstado === "EN_PREPARACION" || log.deEstado === "LISTO",
      };
    });

    const ventas = suma(pagadas.map((c) => c.total));
    res.json({
      desde,
      hasta,
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
        },
      },
      porDia: Array.from(porDia.values()),
      porMetodo: Array.from(porMetodo.values()).sort((a, b) => b.ventas - a.ventas),
      porCanal,
      porMesero: Array.from(porMesero.values()).sort((a, b) => b.ventas - a.ventas),
      porProducto: Array.from(porProducto.values()).sort((a, b) => b.ventas - a.ventas),
      perdidas: perdidas.map(({ items: _items, ...c }) => ({ ...c, atendidoPor: nombreCompleto(c.atendidoPor) })),
      cancelaciones,
      cuentas: cuentas.map(({ items: _items, ...c }) => ({ ...c, atendidoPor: nombreCompleto(c.atendidoPor) })),
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
  catchAsync(async (_req, res) => {
    const items = await prisma.pedidoItem.findMany({
      where: { iniciadoEn: { not: null }, listoEn: { not: null } },
      include: {
        producto: true,
        pedido: {
          include: {
            mesaSesion: { include: { mesa: true, mesero: { select: { id: true, nombre: true, apellido: true } } } },
            mesero: { select: { id: true, nombre: true, apellido: true } },
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
        mesaNumero: item.pedido.mesaSesion?.mesa?.numero ?? `Mostrador (${item.pedido.nombreCliente ?? "cliente"})`,
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
