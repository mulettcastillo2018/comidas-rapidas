// Datos del negocio que solo ve el admin (costos, banderas internas del
// inventario). Se omiten en todo lo que llega a meseros, cocina o pantalla,
// donde cualquiera podría verlos desde el navegador.

// Para el `omit` de Prisma (campos propios del producto).
export const OMITIR_PRODUCTO = { costo: true, costoDesdeReceta: true } as const;
export const OMITIR_ITEM = { costoUnitario: true } as const;

export const productoPublico = { omit: OMITIR_PRODUCTO };
export const productoParaClientes = { omit: OMITIR_PRODUCTO };

// Campos internos, incluidos los del estado en la sede (que se agregan
// después de leer el producto).
const INTERNOS = new Set(["costo", "costoDesdeReceta", "agotadoPorStock", "alertaStockBajo"]);
// El público (carta y pedidos por QR) tampoco ve el inventario; al personal
// sí le sirve saber cuántas quedan.
const DE_INVENTARIO = new Set(["stock", "stockMinimo", "controlaStock"]);

type SinInternos<T> = Omit<T, "costo" | "costoDesdeReceta" | "agotadoPorStock" | "alertaStockBajo">;

// Para un producto ya leído completo (p. ej. tras actualizarlo).
export function sinDatosInternos<T extends object>(producto: T): SinInternos<T> {
  return Object.fromEntries(Object.entries(producto).filter(([campo]) => !INTERNOS.has(campo))) as SinInternos<T>;
}

export function paraClientes<T extends object>(producto: T): Omit<SinInternos<T>, "stock" | "stockMinimo" | "controlaStock"> {
  return Object.fromEntries(Object.entries(producto).filter(([campo]) => !INTERNOS.has(campo) && !DE_INVENTARIO.has(campo))) as Omit<
    SinInternos<T>,
    "stock" | "stockMinimo" | "controlaStock"
  >;
}
