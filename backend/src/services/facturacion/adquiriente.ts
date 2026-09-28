import { z } from "zod";
import { digitoVerificacion, type Adquiriente } from "./documento";

// Datos de quien pide la factura a su nombre.
export const adquirienteSchema = z
  .object({
    // 13 cédula, 31 NIT, 22 cédula de extranjería, 41 pasaporte, 12 tarjeta de identidad.
    tipoIdentificacion: z.enum(["13", "31", "22", "41", "12"]),
    numero: z.string().trim().regex(/^[0-9A-Za-z]{3,20}$/),
    dv: z.string().regex(/^\d$/).nullable().optional(),
    nombre: z.string().trim().min(3).max(200),
    email: z.string().trim().email().max(120).nullable().optional(),
  })
  .refine((a) => a.tipoIdentificacion !== "31" || (a.dv !== undefined && a.dv !== null && a.dv === digitoVerificacion(a.numero)), {
    message: "El dígito de verificación no corresponde a ese NIT",
  });

export const MENSAJE_ADQUIRIENTE = "Revisa los datos para la factura: tipo y número de documento, nombre (y el dígito de verificación si es NIT)";

// Del cuerpo de un cobro: undefined si no pidió factura a su nombre; lanza
// si la pidió con datos inválidos (mejor frenar el cobro que emitir mal).
export function adquirienteDelCobro(cuerpo: unknown): Adquiriente | undefined | "invalido" {
  const valor = (cuerpo as { adquiriente?: unknown } | null)?.adquiriente;
  if (valor === undefined || valor === null) return undefined;
  const parsed = adquirienteSchema.safeParse(valor);
  return parsed.success ? parsed.data : "invalido";
}
