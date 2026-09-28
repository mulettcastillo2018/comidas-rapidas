const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function formatoPesos(valor: number): string {
  return pesos.format(valor);
}

const fechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" });

export function formatoFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso));
}

// "2026-09-27" del día de hoy en Colombia, para los filtros de fecha.
export function hoyLocal(desplazamientoDias = 0): string {
  const fecha = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(fecha);
}
