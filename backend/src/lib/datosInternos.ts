// Datos del negocio que solo ve el admin (costos, banderas internas del
// inventario). Se omiten en todo lo que llega a meseros, cocina o pantalla,
// donde cualquiera podría verlos desde el navegador.
export const OMITIR_PRODUCTO = { costo: true, agotadoPorStock: true, alertaStockBajo: true } as const;
export const OMITIR_ITEM = { costoUnitario: true } as const;

// Para el público (carta y pedidos por QR) tampoco va el inventario; al
// personal sí le sirve saber cuántas quedan.
export const OMITIR_PRODUCTO_PUBLICO = { ...OMITIR_PRODUCTO, stock: true, stockMinimo: true, controlaStock: true } as const;

export const productoPublico = { omit: OMITIR_PRODUCTO };
export const productoParaClientes = { omit: OMITIR_PRODUCTO_PUBLICO };

// Para un producto ya leído completo (p. ej. tras actualizarlo).
export function sinDatosInternos<T extends object>(producto: T): Omit<T, keyof typeof OMITIR_PRODUCTO> {
  return Object.fromEntries(Object.entries(producto).filter(([campo]) => !(campo in OMITIR_PRODUCTO))) as Omit<T, keyof typeof OMITIR_PRODUCTO>;
}
