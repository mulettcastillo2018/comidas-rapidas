import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { ErrorDeNegocio } from "../lib/errores";
import { crearLimitador } from "../lib/limitador";
import { deLaSede, notificarUsuarios } from "./notificaciones";

// Un PIN de 4 a 6 dígitos se adivina probando: tras 5 intentos fallidos el
// mesero queda bloqueado un rato para pedir autorizaciones.
const intentosFallidos = crearLimitador(5, 15 * 60_000);

// Acciones que un mesero no debe poder hacer solo (registrar que el cliente
// se fue sin pagar, cancelar algo que cocina ya empezó): necesitan la clave
// de supervisor de un admin, digitada ahí mismo en el celular del mesero.
// Vale la de un admin de esa sede o la de un admin general. Si quien actúa
// es admin, se autoriza a sí mismo. Devuelve el id del admin que autorizó.
//
// 428 = falta la clave (el celular la pide y reintenta); 403 = incorrecta.
export async function exigirAutorizacion(
  usuario: { userId: string; role: string },
  pin: string | undefined,
  accion: string,
  sedeId: string
): Promise<string> {
  if (usuario.role === "ADMIN") return usuario.userId;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, pinHash: { not: null }, ...deLaSede(sedeId, "ADMIN") },
    select: { id: true, pinHash: true },
  });
  if (admins.length === 0) {
    throw new ErrorDeNegocio(`${accion} necesita autorización, pero ningún administrador ha configurado su clave de supervisor (Admin → Usuarios).`, 409);
  }
  if (!pin) throw new ErrorDeNegocio(`${accion} necesita la clave de supervisor de un administrador.`, 428);
  if (intentosFallidos.excedido(usuario.userId)) {
    throw new ErrorDeNegocio("Demasiados intentos con clave incorrecta. Espera 15 minutos.", 429);
  }
  for (const admin of admins) {
    if (await bcrypt.compare(pin, admin.pinHash!)) {
      intentosFallidos.reiniciar(usuario.userId);
      return admin.id;
    }
  }
  intentosFallidos.registrar(usuario.userId);
  throw new ErrorDeNegocio("Clave de supervisor incorrecta.", 403);
}

// Deja constancia a los demás admins de esa sede y a los generales (p. ej.
// el dueño) de lo que se autorizó. Al que digitó la clave no: estaba ahí.
export async function avisarAutorizacion(autorizadoPorId: string, mensaje: string, sedeId: string, enlace?: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, id: { not: autorizadoPorId }, ...deLaSede(sedeId, "ADMIN") },
    select: { id: true },
  });
  await notificarUsuarios({ userIds: admins.map((a) => a.id), tipo: "AUTORIZACION", mensaje, enlace });
}
