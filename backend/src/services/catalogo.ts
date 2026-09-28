import { mejorPromocion, precioConDescuento, promocionesVigentes } from "./promociones";

// Lo que acompaña a cada producto en la carta y en la lista del mesero.
export const incluirCatalogo = {
  categoria: true,
  adiciones: {
    where: { adicion: { activa: true } },
    select: { adicion: { select: { id: true, nombre: true, precio: true } } },
  },
  componentes: { select: { productoId: true, cantidad: true, producto: { select: { id: true, nombre: true } } } },
} as const;

// Aplana las adiciones y agrega la promoción que aplica en este momento, con
// el precio ya descontado, para mostrarlo tal como se va a cobrar.
export async function conPromociones<P extends { id: string; categoriaId: string; precio: number; adiciones: { adicion: { id: string; nombre: string; precio: number } }[] }>(
  productos: P[]
) {
  const vigentes = await promocionesVigentes();
  return productos.map(({ adiciones, ...producto }) => {
    const promocion = mejorPromocion(producto, vigentes);
    return {
      ...producto,
      adiciones: adiciones.map((a) => a.adicion),
      promocion: promocion
        ? { nombre: promocion.nombre, descuentoPct: promocion.descuentoPct, precio: precioConDescuento(producto.precio, promocion.descuentoPct) }
        : null,
    };
  });
}
