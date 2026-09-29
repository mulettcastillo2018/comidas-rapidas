import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { uploadImagenProducto } from "../lib/upload";
import { emitProductoActualizado } from "../realtime/socket";
import { sinDatosInternos } from "../lib/datosInternos";
import { ErrorDeNegocio } from "../lib/errores";
import { conPromociones, incluirCatalogo } from "../services/catalogo";
import { actualizarEnSede, conEstadoEnSede, estadoEnSede } from "../services/disponibilidad";
import { sedes } from "../services/sedes";

export const productosRouter = Router();

productosRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const productos = await prisma.producto.findMany({
      where: { isActive: true },
      orderBy: { nombre: "asc" },
      include: incluirCatalogo,
    });
    // Disponibilidad e inventario de la sede de quien pregunta.
    const conEstado = await conEstadoEnSede(await conPromociones(productos), req.sedeId);
    // El costo y las banderas internas solo los ve el admin.
    res.json(req.user!.role === "ADMIN" ? conEstado : conEstado.map(sinDatosInternos));
  })
);

const productoSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().trim().min(1),
  precio: z.number().int().positive(),
  tiempoPreparacionMinutos: z.number().int().positive(),
  categoriaId: z.string().min(1),
  imagenUrl: z.string().trim().min(1).nullable().optional(),
  requiereCocina: z.boolean().default(true),
  costo: z.number().int().min(0).nullable().optional(),
  disponible: z.boolean().default(true),
  isActive: z.boolean().default(true),
  esCombo: z.boolean().default(false),
  // Solo para combos: qué productos trae y cuántos de cada uno.
  componentes: z.array(z.object({ productoId: z.string().min(1), cantidad: z.number().int().min(1).max(10) })).max(10).optional(),
});

// Un combo se arma con productos normales (no con otros combos) y al menos
// un producto; nunca contiene a sí mismo.
async function validarComponentes(comboId: string | null, componentes: { productoId: string; cantidad: number }[]) {
  if (componentes.length === 0) throw new ErrorDeNegocio("Un combo necesita al menos un producto", 400);
  const ids = componentes.map((c) => c.productoId);
  if (new Set(ids).size !== ids.length) throw new ErrorDeNegocio("Un producto aparece dos veces en el combo; usa la cantidad", 400);
  const productos = await prisma.producto.findMany({ where: { id: { in: ids } } });
  if (productos.length !== ids.length || productos.some((p) => p.esCombo || p.id === comboId || !p.isActive)) {
    throw new ErrorDeNegocio("Los combos se arman con productos activos de la carta (no con otros combos)", 400);
  }
}

async function guardarComponentes(comboId: string, componentes: { productoId: string; cantidad: number }[]) {
  await prisma.$transaction([
    prisma.comboComponente.deleteMany({ where: { comboId } }),
    prisma.comboComponente.createMany({ data: componentes.map((c) => ({ comboId, ...c })) }),
  ]);
}

// "Agotado" lo decide quien ve la nevera y los insumos: cocina (o el admin).
productosRouter.put(
  "/:id/disponible",
  requireAuth,
  catchAsync(async (req, res) => {
    if (req.user!.role !== "COCINA" && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Solo cocina o el administrador pueden marcar productos agotados" });
      return;
    }
    const parsed = z.object({ disponible: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica si el producto está disponible (true/false)" });
      return;
    }
    // Solo en la sede de quien lo marca: en otro local puede haber.
    const base = await prisma.producto.findUnique({ where: { id: req.params.id }, include: { categoria: true } });
    if (!base) throw new ErrorDeNegocio("Producto no encontrado", 404);
    const { productoId: _p, sedeId: _s, ...estado } = await actualizarEnSede(prisma, base.id, req.sedeId, { disponible: parsed.data.disponible });
    const producto = { ...base, ...estado };
    emitProductoActualizado(producto, req.sedeId);
    res.json(req.user!.role === "ADMIN" ? producto : sinDatosInternos(producto));
  })
);

productosRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    // "disponible" es de cada sede (lo marca cocina), no del producto.
    const { componentes, disponible: _d, ...datos } = parsed.data;
    if (datos.esCombo) await validarComponentes(null, componentes ?? []);
    const producto = await prisma.producto.create({ data: datos });
    if (datos.esCombo) await guardarComponentes(producto.id, componentes!);
    res.status(201).json(producto);
  })
);

productosRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productoSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { componentes, disponible: _d, ...datos } = parsed.data;
    const actual = await prisma.producto.findUnique({ where: { id: req.params.id } });
    if (!actual) throw new ErrorDeNegocio("Producto no encontrado", 404);
    const seraCombo = datos.esCombo ?? actual.esCombo;
    if (seraCombo && componentes) await validarComponentes(actual.id, componentes);
    const actualizado = await prisma.producto.update({ where: { id: actual.id }, data: datos, include: { categoria: true } });
    if (seraCombo && componentes) await guardarComponentes(actualizado.id, componentes);
    if (!seraCombo && actual.esCombo) await prisma.comboComponente.deleteMany({ where: { comboId: actualizado.id } });
    // Nombre, precio, etc. cambian en todas las sedes.
    for (const sede of await sedes()) emitProductoActualizado({ ...actualizado, ...(await estadoEnSede(actualizado.id, sede.id)) }, sede.id);
    const producto = { ...actualizado, ...(await estadoEnSede(actualizado.id, req.sedeId)) };
    res.json(producto);
  })
);

productosRouter.post(
  "/:id/imagen",
  requireAuth,
  requireAdmin,
  uploadImagenProducto.single("imagen"),
  catchAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ninguna imagen" });
      return;
    }
    const imagenUrl = `/uploads/productos/${req.file.filename}`;
    const producto = await prisma.producto.update({ where: { id: req.params.id }, data: { imagenUrl } });
    res.json(producto);
  })
);

productosRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.producto.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  })
);
