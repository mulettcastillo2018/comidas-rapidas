import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ErrorDeNegocio } from "../lib/errores";
import { mejorPromocion, precioConDescuento, promocionesVigentes } from "./promociones";
import { estadosEnSede } from "./disponibilidad";

export interface ItemPedido {
  productoId: string;
  cantidad: number;
  comensalId?: string | null;
  notas?: string | null;
  paraLlevar?: boolean;
  adicionIds?: string[];
}

// Reparte un total entero en partes proporcionales a los pesos sin perder
// ni sobrar un peso (los pesos que sobran del redondeo van a las partes con
// mayor residuo).
export function repartirProporcional(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0);
  const exactas = pesos.map((p) => (suma > 0 ? (total * p) / suma : total / pesos.length));
  const partes = exactas.map(Math.floor);
  let sobrante = total - partes.reduce((s, p) => s + p, 0);
  const porResiduo = exactas.map((e, i) => ({ i, residuo: e - Math.floor(e) })).sort((a, b) => b.residuo - a.residuo);
  for (const { i } of porResiduo) {
    if (sobrante <= 0) break;
    partes[i]++;
    sobrante--;
  }
  return partes;
}

// Convierte lo pedido en las líneas que se guardan:
// - Producto normal: su precio (con la promoción vigente, si hay) + sus
//   adiciones; el costo suma el de las adiciones.
// - Combo: se registran sus partes (una línea por unidad, para que cocina e
//   inventario las manejen como siempre) y el precio del combo se reparte
//   entre ellas según el precio normal de cada una.
// Valida disponibilidad (en esa sede) y adiciones; no escribe nada.
export async function construirLineas(tx: Prisma.TransactionClient, items: ItemPedido[], sedeId: string) {
  const productos = await tx.producto.findMany({
    where: { id: { in: items.map((i) => i.productoId) } },
    include: { componentes: { include: { producto: true } }, adiciones: { select: { adicionId: true } } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  const idsConPartes = [...new Set(productos.flatMap((p) => [p.id, ...p.componentes.map((c) => c.productoId)]))];
  const estados = await estadosEnSede(tx, idsConPartes, sedeId);
  const disponible = (id: string) => estados.get(id)?.disponible ?? true;
  const adiciones = await tx.adicion.findMany({ where: { id: { in: items.flatMap((i) => i.adicionIds ?? []) }, activa: true } });
  const adicionPorId = new Map(adiciones.map((a) => [a.id, a]));
  const vigentes = await promocionesVigentes();
  const ahora = new Date();

  const lineas: Prisma.PedidoItemCreateWithoutPedidoInput[] = [];
  const estadoInicial = (requiereCocina: boolean) => (requiereCocina ? {} : { estado: "LISTO" as const, listoEn: ahora });

  for (const item of items) {
    const producto = porId.get(item.productoId);
    if (!producto || !producto.isActive) throw new ErrorDeNegocio("Uno de los productos seleccionados ya no está en la carta", 400);
    // Se revisa aquí (y no solo en la pantalla) porque un pedido del cliente
    // por QR puede confirmarse un buen rato después de armado.
    if (!disponible(producto.id)) throw new ErrorDeNegocio(`${producto.nombre} está agotado en este momento. Quítalo del pedido o cámbialo por otro.`, 409);
    const promocion = mejorPromocion(producto, vigentes);
    const comunes = {
      comensal: item.comensalId ? { connect: { id: item.comensalId } } : undefined,
      paraLlevar: item.paraLlevar ?? false,
      promocionNombre: promocion?.nombre ?? null,
    };

    if (producto.esCombo) {
      if (producto.componentes.length === 0) throw new ErrorDeNegocio(`El combo ${producto.nombre} no tiene productos configurados`, 400);
      if ((item.adicionIds ?? []).length > 0) throw new ErrorDeNegocio("Las adiciones van en cada producto, no en el combo", 400);
      const faltante = producto.componentes.find((c) => !c.producto.isActive || !disponible(c.productoId));
      if (faltante) throw new ErrorDeNegocio(`El combo ${producto.nombre} no se puede pedir: ${faltante.producto.nombre} está agotado.`, 409);
      const precioCombo = promocion ? precioConDescuento(producto.precio, promocion.descuentoPct) : producto.precio;
      const unidades = producto.componentes.flatMap((c) => Array.from({ length: c.cantidad }, () => c.producto));
      for (let n = 0; n < item.cantidad; n++) {
        const grupo = randomUUID();
        const partes = repartirProporcional(precioCombo, unidades.map((u) => u.precio || 1));
        unidades.forEach((parte, i) => {
          lineas.push({
            ...comunes,
            producto: { connect: { id: parte.id } },
            cantidad: 1,
            notas: i === 0 ? (item.notas ?? null) : null,
            precioUnitario: partes[i],
            costoUnitario: parte.costo,
            tiempoPreparacionMinutos: parte.tiempoPreparacionMinutos,
            comboGrupo: grupo,
            comboNombre: producto.nombre,
            ...estadoInicial(parte.requiereCocina),
          });
        });
      }
      continue;
    }

    const permitidas = new Set(producto.adiciones.map((a) => a.adicionId));
    const elegidas = (item.adicionIds ?? []).map((id) => {
      const adicion = adicionPorId.get(id);
      if (!adicion || !permitidas.has(id)) throw new ErrorDeNegocio(`Una de las adiciones no aplica a ${producto.nombre}`, 400);
      return adicion;
    });
    const extra = elegidas.reduce((s, a) => s + a.precio, 0);
    const base = promocion ? precioConDescuento(producto.precio, promocion.descuentoPct) : producto.precio;
    lineas.push({
      ...comunes,
      producto: { connect: { id: producto.id } },
      cantidad: item.cantidad,
      notas: item.notas ?? null,
      precioUnitario: base + extra,
      precioLista: promocion ? producto.precio + extra : null,
      costoUnitario: producto.costo !== null ? producto.costo + elegidas.reduce((s, a) => s + (a.costo ?? 0), 0) : null,
      tiempoPreparacionMinutos: producto.tiempoPreparacionMinutos,
      adiciones: { create: elegidas.map((a) => ({ adicionId: a.id, nombre: a.nombre, precio: a.precio, costo: a.costo })) },
      ...estadoInicial(producto.requiereCocina),
    });
  }
  return lineas;
}
