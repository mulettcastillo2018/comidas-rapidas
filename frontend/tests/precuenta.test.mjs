// División sugerida de la cuenta por persona. Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPrecuenta, montoDescuento, propinaSugerida } from "../src/lib/precuenta.ts";

const item = (id, comensalId, precio, cantidad = 1, extra = {}) => ({
  id,
  comensalId,
  productoId: id,
  precioUnitario: precio,
  cantidad,
  estado: "ENTREGADO",
  paraLlevar: false,
  ...extra,
});

const sesion = {
  comensales: [
    { id: "ana", nombre: "Ana" },
    { id: "beto", nombre: "Beto" },
    { id: "caro", nombre: "Caro" },
  ],
  pedidos: [
    {
      items: [
        item("1", "ana", 10000),
        item("2", "beto", 5000, 2),
        item("3", null, 7000), // para compartir
        item("4", null, 3000, 1, { paraLlevar: true }),
        item("5", "caro", 9000, 1, { estado: "CANCELADO" }),
      ],
    },
  ],
};

test("no cobra lo cancelado y suma la propina aparte", () => {
  const p = calcularPrecuenta(sesion, 1000);
  assert.equal(p.subtotal, 30000);
  assert.equal(p.total, 31000);
  assert.equal(p.totalCompartido, 10000);
});

test("cada quien paga lo suyo; lo compartido y la propina se reparten sin perder pesos", () => {
  const [ana, beto, caro] = calcularPrecuenta(sesion, 1000).porPersona;
  assert.deepEqual([ana.propios, beto.propios, caro.propios], [10000, 10000, 0]);
  assert.deepEqual([ana.compartido, beto.compartido, caro.compartido], [3334, 3333, 3333]);
  assert.deepEqual([ana.propina, beto.propina, caro.propina], [334, 333, 333]);
  const p = calcularPrecuenta(sesion, 1000);
  assert.equal(
    p.porPersona.reduce((s, x) => s + x.total, 0),
    p.total
  );
});

test("el descuento se reparte según lo que consumió cada uno, sin perder pesos", () => {
  const p = calcularPrecuenta(sesion, 1000, 3000);
  assert.equal(p.total, 28000);
  const [ana, beto, caro] = p.porPersona;
  // Consumos: Ana 13334, Beto 13333, Caro 3333 (de 30000).
  assert.deepEqual([ana.descuento, beto.descuento, caro.descuento], [1334, 1333, 333]);
  assert.equal(
    p.porPersona.reduce((s, x) => s + x.total, 0),
    p.total
  );
});

test("descuento por porcentaje o por valor, nunca más que el consumo", () => {
  assert.equal(montoDescuento(30000, "PORCENTAJE", 10), 3000);
  assert.equal(montoDescuento(30000, "PORCENTAJE", 100), 30000);
  assert.equal(montoDescuento(30000, "VALOR", 50000), 30000);
  assert.equal(montoDescuento(30000, "VALOR", 0), 0);
});

test("propina sugerida del 10% redondeada a la centena", () => {
  assert.equal(propinaSugerida(43500), 4400);
  assert.equal(propinaSugerida(0), 0);
});
