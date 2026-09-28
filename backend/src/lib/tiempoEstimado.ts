interface ItemParaEstimar {
  estado: string;
  iniciadoEn: Date | null;
  tiempoPreparacionMinutos: number;
}

// Hora aproximada en que todo el pedido estará listo: cocina prepara los
// productos en paralelo, así que es el que más tarde termine. Cada producto
// cuenta desde que cocina lo empezó o, si no lo ha empezado, desde que llegó
// el pedido. null si ya no queda nada por preparar.
export function estimarListoEn(creadoEn: Date, items: ItemParaEstimar[]): Date | null {
  const pendientes = items.filter((i) => i.estado === "RECIBIDO" || i.estado === "EN_PREPARACION");
  if (pendientes.length === 0) return null;
  const fin = Math.max(...pendientes.map((i) => (i.iniciadoEn ?? creadoEn).getTime() + i.tiempoPreparacionMinutos * 60_000));
  return new Date(fin);
}
