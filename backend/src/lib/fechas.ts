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

const formatoHora = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, hour: "numeric", hourCycle: "h23" });
const formatoDiaSemana = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, weekday: "short" });
const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Hora local (0–23) de una fecha.
export function horaLocal(fecha: Date): number {
  return Number(formatoHora.format(fecha)) % 24;
}

const formatoMinuto = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, minute: "numeric" });

// Minuto del día local (0–1439), p. ej. 5:30 p. m. = 1050.
export function minutoDelDiaLocal(fecha: Date): number {
  return horaLocal(fecha) * 60 + Number(formatoMinuto.format(fecha));
}

// Día de la semana local: 0 = domingo … 6 = sábado.
export function diaSemanaLocal(fecha: Date): number {
  return DIAS.indexOf(formatoDiaSemana.format(fecha));
}

// Rango [inicio del día `desde`, inicio del día siguiente a `hasta`) en hora local.
export function rangoDeDias(desde: string, hasta: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${desde}T00:00:00${DESFASE}`);
  const fin = new Date(`${hasta}T00:00:00${DESFASE}`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { inicio, fin };
}
