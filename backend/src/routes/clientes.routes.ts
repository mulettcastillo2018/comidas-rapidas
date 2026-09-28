import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { nombreCompleto } from "../lib/nombre";
import { normalizarCelular, programaPuntos } from "../services/fidelizacion";

// Clientes frecuentes y su programa de puntos.
export const clientesRouter = Router();
clientesRouter.use(requireAuth);

const noEsPantalla = (role: string) => {
  if (role === "PANTALLA") throw new ErrorDeNegocio("No disponible", 403);
};

// Lo que ve quien cobra.
function vistaCliente(c: { id: string; nombre: string; telefono: string; puntos: number }, programa: Awaited<ReturnType<typeof programaPuntos>>) {
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    puntos: c.puntos,
    valorPuntos: c.puntos * programa.valorPunto,
    puedeCanjear: programa.activo && c.puntos >= programa.minimoCanje,
  };
}

clientesRouter.get(
  "/programa",
  catchAsync(async (_req, res) => {
    res.json(await programaPuntos());
  })
);

clientesRouter.get(
  "/buscar",
  catchAsync(async (req, res) => {
    noEsPantalla(req.user!.role);
    const celular = normalizarCelular(String(req.query.telefono ?? ""));
    if (!celular) throw new ErrorDeNegocio("Escribe un celular de 10 dígitos", 400);
    const cliente = await prisma.cliente.findFirst({ where: { telefono: celular, eliminadoEn: null } });
    if (!cliente) throw new ErrorDeNegocio("No hay un cliente registrado con ese celular", 404);
    res.json(vistaCliente(cliente, await programaPuntos()));
  })
);

const registroSchema = z.object({
  telefono: z.string(),
  nombre: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(120).nullable().optional(),
  // Ley 1581: el cliente autoriza guardar sus datos para el programa.
  autoriza: z.literal(true),
});

clientesRouter.post(
  "/",
  catchAsync(async (req, res) => {
    noEsPantalla(req.user!.role);
    const parsed = registroSchema.safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Escribe el nombre y confirma que el cliente autoriza el uso de sus datos", 400);
    const celular = normalizarCelular(parsed.data.telefono);
    if (!celular) throw new ErrorDeNegocio("Escribe un celular de 10 dígitos", 400);
    if (await prisma.cliente.findFirst({ where: { telefono: celular } })) throw new ErrorDeNegocio("Ya hay un cliente con ese celular", 409);
    const cliente = await prisma.cliente.create({
      data: { telefono: celular, nombre: parsed.data.nombre, email: parsed.data.email ?? null, autorizadoEn: new Date() },
    });
    res.status(201).json(vistaCliente(cliente, await programaPuntos()));
  })
);

// ---------------------------------------------------------------------------
// Solo admin

clientesRouter.get(
  "/",
  requireAdmin,
  catchAsync(async (req, res) => {
    const buscar = typeof req.query.buscar === "string" ? req.query.buscar.trim() : "";
    const digitos = buscar.replace(/\D/g, "");
    const donde = {
      eliminadoEn: null,
      ...(buscar ? { OR: [{ nombre: { contains: buscar, mode: "insensitive" as const } }, ...(digitos.length >= 3 ? [{ telefono: { contains: digitos } }] : [])] } : {}),
    };
    const [clientes, totales, programa, cuentas, conCliente] = await Promise.all([
      prisma.cliente.findMany({ where: donde, orderBy: [{ totalGastado: "desc" }], take: 100 }),
      prisma.cliente.aggregate({ where: { eliminadoEn: null }, _count: true, _sum: { puntos: true } }),
      programaPuntos(),
      prisma.factura.count({ where: { estado: "PAGADA", pagadaEn: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      prisma.factura.count({ where: { estado: "PAGADA", clienteId: { not: null }, pagadaEn: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    ]);
    res.json({
      clientes,
      resumen: {
        clientes: totales._count,
        // Lo que el negocio "debe" en puntos sin canjear.
        puntosPendientes: totales._sum.puntos ?? 0,
        valorPuntosPendientes: (totales._sum.puntos ?? 0) * programa.valorPunto,
        // Últimos 30 días: qué parte de las cuentas tuvo un cliente identificado.
        cuentasConCliente: conCliente,
        cuentas,
      },
    });
  })
);

clientesRouter.get(
  "/:id/movimientos",
  requireAdmin,
  catchAsync(async (req, res) => {
    const movimientos = await prisma.movimientoPuntos.findMany({
      where: { clienteId: req.params.id },
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: { user: { select: { nombre: true, apellido: true } } },
    });
    res.json(movimientos.map(({ user, ...m }) => ({ ...m, usuario: user ? nombreCompleto(user) : null })));
  })
);

clientesRouter.post(
  "/:id/ajuste",
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = z.object({ puntos: z.number().int().refine((n) => n !== 0), nota: z.string().trim().min(3).max(200) }).safeParse(req.body);
    if (!parsed.success) throw new ErrorDeNegocio("Indica los puntos (positivos para sumar, negativos para quitar) y el motivo", 400);
    const cliente = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.cliente.updateMany({
        where: { id: req.params.id, eliminadoEn: null, ...(parsed.data.puntos < 0 ? { puntos: { gte: -parsed.data.puntos } } : {}) },
        data: { puntos: { increment: parsed.data.puntos } },
      });
      if (actualizado.count === 0) throw new ErrorDeNegocio("El cliente no existe o no tiene tantos puntos", 409);
      const c = await tx.cliente.findUniqueOrThrow({ where: { id: req.params.id } });
      await tx.movimientoPuntos.create({ data: { clienteId: c.id, tipo: "AJUSTE", puntos: parsed.data.puntos, saldo: c.puntos, nota: parsed.data.nota, userId: req.user!.userId } });
      return c;
    });
    res.json(cliente);
  })
);

// Supresión de datos (Ley 1581): el cliente pide que lo borren. Sus compras
// quedan (son ventas del negocio) pero sin nada que lo identifique.
clientesRouter.delete(
  "/:id",
  requireAdmin,
  catchAsync(async (req, res) => {
    const borrado = await prisma.cliente.updateMany({
      where: { id: req.params.id, eliminadoEn: null },
      data: { nombre: "Cliente eliminado", telefono: `eliminado-${req.params.id}`, email: null, puntos: 0, eliminadoEn: new Date() },
    });
    if (borrado.count === 0) throw new ErrorDeNegocio("Cliente no encontrado", 404);
    res.status(204).send();
  })
);
