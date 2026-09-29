import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("29bc41aa", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@comidasrapidas.test" },
    update: {},
    create: {
      nombre: "Admin",
      apellido: "",
      email: "admin@comidasrapidas.test",
      passwordHash,
      role: "ADMIN",
    },
  });

  const categorias = await Promise.all(
    [
      { nombre: "Hamburguesas", slug: "hamburguesas", icono: "Beef" },
      { nombre: "Perros Calientes", slug: "perros-calientes", icono: "Sandwich" },
      { nombre: "Salchipapas", slug: "salchipapas", icono: "UtensilsCrossed" },
      { nombre: "Pizzas", slug: "pizzas", icono: "Pizza" },
      { nombre: "Bebidas", slug: "bebidas", icono: "CupSoda" },
    ].map((c) =>
      prisma.categoria.upsert({ where: { slug: c.slug }, update: {}, create: c })
    )
  );

  const [hamburguesas, perros, salchipapas, pizzas, bebidas] = categorias;

  const productos = [
    { nombre: "Hamburguesa Clásica", descripcion: "Carne, queso, lechuga, tomate y salsas de la casa.", precio: 18000, tiempoPreparacionMinutos: 12, categoriaId: hamburguesas.id },
    { nombre: "Hamburguesa Doble", descripcion: "Doble carne, doble queso, tocineta.", precio: 24000, tiempoPreparacionMinutos: 15, categoriaId: hamburguesas.id },
    { nombre: "Perro Caliente Especial", descripcion: "Salchicha, papas hilo, queso fundido y salsas.", precio: 14000, tiempoPreparacionMinutos: 8, categoriaId: perros.id },
    { nombre: "Salchipapa Mixta", descripcion: "Papas fritas, salchicha, tocineta y queso.", precio: 16000, tiempoPreparacionMinutos: 10, categoriaId: salchipapas.id },
    { nombre: "Pizza Personal Pepperoni", descripcion: "Masa artesanal, salsa de tomate, mozzarella y pepperoni.", precio: 22000, tiempoPreparacionMinutos: 18, categoriaId: pizzas.id },
    { nombre: "Gaseosa 400ml", descripcion: "Bebida gaseosa fría, varios sabores.", precio: 5000, tiempoPreparacionMinutos: 1, categoriaId: bebidas.id },
  ];

  // Producto no tiene una unique de nombre+categoría, así que se evita duplicar
  // con un findFirst/create manual (el seed puede correrse más de una vez).
  for (const producto of productos) {
    const existing = await prisma.producto.findFirst({ where: { nombre: producto.nombre, categoriaId: producto.categoriaId } });
    if (!existing) await prisma.producto.create({ data: producto });
  }

  // La sede principal la crea la migración; en una base nueva, aquí.
  const sede =
    (await prisma.sede.findFirst({ where: { esPrincipal: true } })) ??
    (await prisma.sede.create({ data: { id: "sede-principal", nombre: "Principal", esPrincipal: true } }));

  const mesas = ["1", "2", "3", "4", "5", "6"];
  for (const numero of mesas) {
    await prisma.mesa.upsert({ where: { sedeId_numero: { sedeId: sede.id, numero } }, update: {}, create: { numero, capacidad: 4, sedeId: sede.id } });
  }

  console.log("Seed completado:");
  console.log("  Admin:", admin.email, "(password: 29bc41aa)");
  console.log("  Categorías:", categorias.length);
  console.log("  Productos:", productos.length);
  console.log("  Mesas:", mesas.length);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
