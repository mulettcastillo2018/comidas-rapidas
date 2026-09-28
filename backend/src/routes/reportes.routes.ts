import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { nombreCompleto } from "../lib/nombre";

export const reportesRouter = Router();

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
