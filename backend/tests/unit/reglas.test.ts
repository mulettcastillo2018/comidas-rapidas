// Reglas de negocio puras (sin base de datos ni servidor).
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularEstadoPedido } from "../../src/lib/pedidoAggregate";
import { estimarListoEn } from "../../src/lib/tiempoEstimado";
import { diaLocal, esDiaValido, rangoDeDias } from "../../src/lib/fechas";
import { nombreCompleto, nombreCorto } from "../../src/lib/nombre";
import { crearLimitador } from "../../src/lib/limitador";

const estados = (...lista: string[]) => lista.map((estado) => ({ estado }));

test("el estado del pedido es el de su producto menos avanzado (sin contar cancelados)", () => {
  assert.equal(calcularEstadoPedido(estados("LISTO", "RECIBIDO")), "RECIBIDO");
  assert.equal(calcularEstadoPedido(estados("LISTO", "EN_PREPARACION", "ENTREGADO")), "EN_PREPARACION");
  assert.equal(calcularEstadoPedido(estados("ENTREGADO", "LISTO")), "LISTO");
  assert.equal(calcularEstadoPedido(estados("ENTREGADO", "CANCELADO")), "ENTREGADO");
  assert.equal(calcularEstadoPedido(estados("CANCELADO", "CANCELADO")), "CANCELADO");
});

test("la hora estimada es la del producto que más tarde termina", () => {
  const llegada = new Date("2026-01-10T12:00:00Z");
  const iniciado = new Date("2026-01-10T12:05:00Z");
  const listo = estimarListoEn(llegada, [
    { estado: "RECIBIDO", iniciadoEn: null, tiempoPreparacionMinutos: 10 }, // 12:10
    { estado: "EN_PREPARACION", iniciadoEn: iniciado, tiempoPreparacionMinutos: 12 }, // 12:17
    { estado: "LISTO", iniciadoEn: null, tiempoPreparacionMinutos: 60 }, // ya salió: no cuenta
  ]);
  assert.equal(listo?.toISOString(), "2026-01-10T12:17:00.000Z");
  assert.equal(estimarListoEn(llegada, [{ estado: "LISTO", iniciadoEn: null, tiempoPreparacionMinutos: 5 }]), null);
});

test("los días se cuentan en hora de Colombia (UTC-5)", () => {
  // 9:30 p. m. en Colombia ya es el día siguiente en UTC.
  assert.equal(diaLocal(new Date("2026-03-16T02:30:00Z")), "2026-03-15");
  const { inicio, fin } = rangoDeDias("2026-03-15", "2026-03-16");
  assert.equal(inicio.toISOString(), "2026-03-15T05:00:00.000Z");
  assert.equal(fin.toISOString(), "2026-03-17T05:00:00.000Z");
  assert.ok(esDiaValido("2026-02-28"));
  assert.ok(!esDiaValido("2026-2-28"));
  assert.ok(!esDiaValido("hoy"));
});

test("nombres: completo para el personal, abreviado para pantallas públicas", () => {
  assert.equal(nombreCompleto({ nombre: "Katherine", apellido: "Díaz" }), "Katherine Díaz");
  assert.equal(nombreCompleto(null), "");
  assert.equal(nombreCorto("Ana María Pérez"), "Ana P.");
  assert.equal(nombreCorto("  pedro  "), "pedro");
  assert.equal(nombreCorto(null), "");
});

test("el limitador corta al llegar al máximo y se reinicia", () => {
  const limitador = crearLimitador(2, 60_000);
  assert.ok(!limitador.excedido("x"));
  limitador.registrar("x");
  limitador.registrar("x");
  assert.ok(limitador.excedido("x"));
  assert.ok(!limitador.excedido("otra-clave"));
  limitador.reiniciar("x");
  assert.ok(!limitador.excedido("x"));
});
