import { Router } from "express";
import { z } from "zod";
import { Prisma, type Sede } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminGeneral } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { ErrorDeNegocio } from "../lib/errores";
import { configuracionFiscal, faltantes } from "../services/facturacion/servicio";
import { olvidarSedes, sedes } from "../services/sedes";

// Las sedes del negocio. Cada una tiene sus mesas, su personal, su cocina, su
// caja (con su propia numeración POS) y su inventario; la carta y los precios
// son los mismos en todas.
export const sedesRouter = Router();
sedesRouter.use(requireAuth);

// Público solo para el QR de mostrador: el nombre de la sede.
export const sedesPublicasRouter = Router();
sedesPublicasRouter.get(
  "/:id",
  catchAsync(async (req, res) => {
    const sede = (await sedes()).find((s) => s.id === req.params.id && s.activa);
    if (!sede) throw new ErrorDeNegocio("Sede no encontrada", 404);
    res.json({ id: sede.id, nombre: sede.nombre, direccion: sede.direccion });
  })
);

function basica(s: Sede) {
  return { id: s.id, nombre: s.nombre, direccion: s.direccion, activa: s.activa, esPrincipal: s.esPrincipal };
}

// Todos ven las sedes (para mostrar dónde trabajan y, el administrador
// general, para elegir en cuál está); los detalles de la caja, solo el admin.
sedesRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const lista = await sedes();
    if (req.user!.role !== "ADMIN") {
      res.json({ actual: req.sedeId, puedeCambiar: false, sedes: lista.filter((s) => s.activa).map(basica) });
      return;
    }
    const visibles = req.sedeFija ? lista.filter((s) => s.id === req.sedeId) : lista;
    const [config, personal, mesas] = await Promise.all([
      configuracionFiscal(),
      prisma.user.groupBy({ by: ["sedeId"], where: { isActive: true }, _count: true }),
      prisma.mesa.groupBy({ by: ["sedeId"], where: { activa: true }, _count: true }),
    ]);
    res.json({
      actual: req.sedeId,
      puedeCambiar: !req.sedeFija,
      sedes: visibles.map((s) => ({
        ...s,
        personal: personal.find((p) => p.sedeId === s.id)?._count ?? 0,
        mesas: mesas.find((m) => m.sedeId === s.id)?._count ?? 0,
        faltantesPos: config.activa ? faltantes(config, "POS", s) : [],
      })),
    });
  })
);

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texto = (max: number) => z.string().trim().min(1).max(max);
const prefijo = z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/);

// undefined = no cambiar (en una edición); null = borrar.
const sedeSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  direccion: z.string().trim().max(200).nullable().optional(),
  activa: z.boolean().optional(),
  esPrincipal: z.boolean().optional(),
  posResolucion: texto(14).nullable().optional(),
  posPrefijo: prefijo.nullable().optional(),
  posDesde: z.number().int().positive().nullable().optional(),
  posHasta: z.number().int().positive().nullable().optional(),
  posFechaInicio: dia.nullable().optional(),
  posFechaFin: dia.nullable().optional(),
  posSiguiente: z.number().int().positive().nullable().optional(),
  cajaPlaca: texto(50).nullable().optional(),
  cajaUbicacion: texto(100).nullable().optional(),
});
type DatosSede = z.infer<typeof sedeSchema>;

function leer(body: unknown, parcial: boolean): Partial<DatosSede> {
  const parsed = (parcial ? sedeSchema.partial() : sedeSchema).safeParse(body);
  if (!parsed.success) {
    const campo = Object.keys(parsed.error.flatten().fieldErrors)[0];
    throw new ErrorDeNegocio(campo === "nombre" ? "El nombre de la sede debe tener de 2 a 60 letras" : `Revisa el campo "${campo ?? "sede"}"`, 400);
  }
  return parsed.data;
}

// El rango POS (con lo que ya tenía la sede, si solo se cambia una parte).
function validarRango(d: Partial<DatosSede>, antes: Sede | null) {
  const desde = d.posDesde !== undefined ? d.posDesde : (antes?.posDesde ?? null);
  const hasta = d.posHasta !== undefined ? d.posHasta : (antes?.posHasta ?? null);
  const siguiente = d.posSiguiente !== undefined ? d.posSiguiente : (antes?.posSiguiente ?? null);
  if (desde !== null && hasta !== null && desde > hasta) throw new ErrorDeNegocio("El rango POS está al revés", 400);
  if (siguiente !== null && desde !== null && hasta !== null && (siguiente < desde || siguiente > hasta + 1)) {
    throw new ErrorDeNegocio("El siguiente número POS está fuera del rango", 400);
  }
}

function nombreRepetido(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ErrorDeNegocio("Ya hay una sede con ese nombre", 409);
  throw err;
}

sedesRouter.post(
  "/",
  requireAdmin,
  requireAdminGeneral,
  catchAsync(async (req, res) => {
    const { esPrincipal = false, ...datos } = leer(req.body, false) as DatosSede;
    validarRango(datos, null);
    if (esPrincipal && datos.activa === false) throw new ErrorDeNegocio("La sede principal no puede estar inactiva", 400);
    const sede = await prisma
      .$transaction(async (tx) => {
        if (esPrincipal) await tx.sede.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } });
        return tx.sede.create({ data: { ...datos, esPrincipal } });
      })
      .catch(nombreRepetido);
    olvidarSedes();
    res.status(201).json(sede);
  })
);

// El administrador general edita cualquier sede; el de una sede, solo los
// datos de su caja y la dirección de la suya.
const SOLO_GENERAL = ["nombre", "activa", "esPrincipal"] as const;

sedesRouter.put(
  "/:id",
  requireAdmin,
  catchAsync(async (req, res) => {
    const antes = await prisma.sede.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new ErrorDeNegocio("Sede no encontrada", 404);
    const datos = leer(req.body, true);
    if (req.sedeFija) {
      if (antes.id !== req.sedeId) throw new ErrorDeNegocio("Esa sede no es la tuya", 403);
      if (SOLO_GENERAL.some((c) => datos[c] !== undefined && datos[c] !== antes[c])) {
        throw new ErrorDeNegocio("Solo el administrador general cambia el nombre, el estado o la sede principal", 403);
      }
    }
    validarRango(datos, antes);
    // Sin "siguiente número": se sigue donde iba; si cambió el prefijo (nueva
    // resolución), empieza en el inicio del rango.
    const nuevoPrefijo = datos.posPrefijo !== undefined ? datos.posPrefijo : antes.posPrefijo;
    if (datos.posSiguiente === null) datos.posSiguiente = nuevoPrefijo === antes.posPrefijo ? antes.posSiguiente : null;

    const activa = datos.activa ?? antes.activa;
    const esPrincipal = datos.esPrincipal ?? antes.esPrincipal;
    if (antes.esPrincipal && datos.esPrincipal === false) throw new ErrorDeNegocio("Para cambiar la sede principal, marca otra como principal", 400);
    if (esPrincipal && !activa) throw new ErrorDeNegocio("La sede principal no puede estar inactiva", 400);
    if (antes.activa && !activa) await exigirSinOperacion(antes);

    const sede = await prisma
      .$transaction(async (tx) => {
        if (esPrincipal && !antes.esPrincipal) await tx.sede.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } });
        return tx.sede.update({ where: { id: antes.id }, data: datos });
      })
      .catch(nombreRepetido);
    olvidarSedes();
    res.json(sede);
  })
);

// Una sede se cierra sin nada en curso y sin personal asignado (si no, esa
// gente quedaría trabajando en una sede que no aparece).
async function exigirSinOperacion(sede: Sede) {
  const [mesasAbiertas, pedidosActivos, personal] = await Promise.all([
    prisma.mesaSesion.count({ where: { estado: { not: "CERRADA" }, mesa: { sedeId: sede.id } } }),
    prisma.pedido.count({ where: { sedeId: sede.id, estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] } } }),
    prisma.user.count({ where: { sedeId: sede.id, isActive: true } }),
  ]);
  if (mesasAbiertas > 0) throw new ErrorDeNegocio(`${sede.nombre} tiene mesas abiertas: ciérralas antes de desactivarla`, 409);
  if (pedidosActivos > 0) throw new ErrorDeNegocio(`${sede.nombre} tiene pedidos en curso`, 409);
  if (personal > 0) throw new ErrorDeNegocio(`${sede.nombre} tiene ${personal} persona(s) asignada(s): pásalas a otra sede primero`, 409);
}
