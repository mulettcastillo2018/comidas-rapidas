import { prisma } from "../lib/prisma";
import { rangoDeDias } from "../lib/fechas";

const suma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);
const redondear1 = (n: number) => Math.round(n * 10) / 10;

// Si al menos esta parte de lo vendido tiene costo configurado, el costo de
// lo vendido sale de los productos; si no, de lo que se pagó en insumos.
const COBERTURA_MINIMA_COSTOS = 0.8;

const itemsVendidos = {
  where: { estado: { not: "CANCELADO" as const } },
  select: { cantidad: true, precioUnitario: true, costoUnitario: true, producto: { select: { nombre: true } } },
};

// Estado de resultados del rango (hora de Colombia): ingresos, costo de lo
// vendido, comisiones de apps, gastos y utilidad; y punto de equilibrio.
// Las propinas no son del negocio: se informan aparte.
export async function estadoDeResultados(desde: string, hasta: string) {
  const { inicio, fin } = rangoDeDias(desde, hasta);
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000);
  const [facturas, gastos] = await Promise.all([
    prisma.factura.findMany({
      where: { estado: "PAGADA", pagadaEn: { gte: inicio, lt: fin } },
      select: {
        subtotal: true,
        descuentoMonto: true,
        envioMonto: true,
        comisionMonto: true,
        propinaMonto: true,
        mesaSesion: { select: { pedidos: { select: { items: itemsVendidos } } } },
        pedido: { select: { items: itemsVendidos } },
      },
    }),
    prisma.gasto.findMany({ where: { fecha: { gte: inicio, lt: fin } }, select: { categoria: true, monto: true, esFijo: true } }),
  ]);

  const items = facturas.flatMap((f) => (f.mesaSesion ? f.mesaSesion.pedidos.flatMap((p) => p.items) : (f.pedido?.items ?? [])));
  const conCosto = items.filter((i) => i.costoUnitario !== null);
  const ventasConCosto = suma(conCosto.map((i) => i.cantidad * i.precioUnitario));
  const costoTeorico = suma(conCosto.map((i) => i.cantidad * i.costoUnitario!));
  const subtotal = suma(facturas.map((f) => f.subtotal));
  const ventasProductos = subtotal - suma(facturas.map((f) => f.descuentoMonto));
  const envios = suma(facturas.map((f) => f.envioMonto));
  const comisiones = suma(facturas.map((f) => f.comisionMonto));
  const ingresos = ventasProductos + envios;

  const comprasInsumos = suma(gastos.filter((g) => g.categoria === "INSUMOS").map((g) => g.monto));
  const fuenteCosto: "PRODUCTOS" | "COMPRAS" =
    subtotal > 0 && ventasConCosto >= subtotal * COBERTURA_MINIMA_COSTOS ? "PRODUCTOS" : comprasInsumos > 0 ? "COMPRAS" : "PRODUCTOS";
  const costoVentas = fuenteCosto === "PRODUCTOS" ? costoTeorico : comprasInsumos;
  const utilidadBruta = ingresos - costoVentas - comisiones;

  // Los insumos ya están en el costo de lo vendido (de una u otra forma):
  // restarlos también como gasto sería contarlos dos veces.
  const operativos = gastos.filter((g) => g.categoria !== "INSUMOS");
  const totalGastos = suma(operativos.map((g) => g.monto));
  const fijos = suma(operativos.filter((g) => g.esFijo).map((g) => g.monto));
  const variables = totalGastos - fijos;
  const porCategoria = new Map<string, number>();
  for (const g of operativos) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.monto);
  const utilidadNeta = utilidadBruta - totalGastos;

  // Margen de contribución: lo que queda de cada peso vendido después de los
  // costos que suben y bajan con las ventas. Los fijos se cubren con eso.
  const margenContribucion = ingresos > 0 ? (ingresos - costoVentas - comisiones - variables) / ingresos : 0;
  const ventasNecesarias = fijos > 0 && margenContribucion > 0 ? Math.round(fijos / margenContribucion) : null;

  return {
    desde,
    hasta,
    dias,
    cuentas: facturas.length,
    ingresos: { ventasProductos, envios, total: ingresos },
    fuenteCosto,
    costoVentas,
    comprasInsumos,
    productosSinCosto: [...new Set(items.filter((i) => i.costoUnitario === null).map((i) => i.producto.nombre))],
    comisiones,
    utilidadBruta,
    gastos: {
      total: totalGastos,
      fijos,
      variables,
      porCategoria: Array.from(porCategoria, ([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
    },
    utilidadNeta,
    margenNetoPct: ingresos > 0 ? redondear1((utilidadNeta / ingresos) * 100) : null,
    puntoEquilibrio:
      ventasNecesarias !== null
        ? {
            margenContribucionPct: redondear1(margenContribucion * 100),
            ventasNecesarias,
            ventasPorDia: Math.round(ventasNecesarias / Math.max(1, dias)),
            alcanzado: ingresos >= ventasNecesarias,
          }
        : null,
    propinas: suma(facturas.map((f) => f.propinaMonto)),
  };
}
