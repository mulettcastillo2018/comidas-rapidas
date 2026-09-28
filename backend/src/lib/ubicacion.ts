// Cómo se nombra un pedido en avisos y reportes: la mesa, o de dónde llegó.
export function ubicacionDe(pedido: {
  canal: string;
  nombreCliente: string | null;
  codigoPlataforma?: string | null;
  mesaSesion?: { mesa: { numero: string } } | null;
  plataforma?: { nombre: string } | null;
}): string {
  if (pedido.mesaSesion) return `Mesa ${pedido.mesaSesion.mesa.numero}`;
  const cliente = pedido.nombreCliente ?? "cliente";
  if (pedido.canal === "DOMICILIO") return `Domicilio — ${cliente}`;
  if (pedido.canal === "PLATAFORMA") {
    return `${pedido.plataforma?.nombre ?? "App"}${pedido.codigoPlataforma ? ` #${pedido.codigoPlataforma}` : ""} — ${cliente}`;
  }
  return `Mostrador — ${cliente}`;
}
