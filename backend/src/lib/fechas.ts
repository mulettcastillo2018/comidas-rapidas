// El negocio opera en hora de Colombia (UTC-5, sin horario de verano). Los
// reportes agrupan por día local: una venta a las 9 p. m. no puede aparecer
// como del día siguiente solo porque en UTC ya pasó la medianoche.
export const ZONA_HORARIA = "America/Bogota";
const DESFASE = "-05:00";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit" });

// "2026-09-27" (día local) para una fecha dada.
export function diaLocal(fecha: Date): string {
  return formatoDia.format(fecha);
}

export function esDiaValido(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(new Date(`${dia}T00:00:00${DESFASE}`).getTime());
}

// Rango [inicio del día `desde`, inicio del día siguiente a `hasta`) en hora local.
export function rangoDeDias(desde: string, hasta: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${desde}T00:00:00${DESFASE}`);
  const fin = new Date(`${hasta}T00:00:00${DESFASE}`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { inicio, fin };
}
