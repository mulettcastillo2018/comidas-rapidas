// Datos del negocio que solo ve el admin (costos, inventario). Se omiten en
// todo lo que llega a meseros, cocina, pantalla o a la carta pública, donde
// cualquiera podría verlos desde el navegador.
export const OMITIR_PRODUCTO = { costo: true } as const;
export const OMITIR_ITEM = { costoUnitario: true } as const;

export const productoPublico = { omit: OMITIR_PRODUCTO };

// Para un producto ya leído completo (p. ej. tras actualizarlo).
export function sinDatosInternos<T extends object>(producto: T): Omit<T, keyof typeof OMITIR_PRODUCTO> {
  return Object.fromEntries(Object.entries(producto).filter(([campo]) => !(campo in OMITIR_PRODUCTO))) as Omit<T, keyof typeof OMITIR_PRODUCTO>;
}
