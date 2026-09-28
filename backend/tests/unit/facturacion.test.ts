// Cálculo del documento electrónico (sin base de datos ni Alanube).
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularTotales, construirDocumento, CONSUMIDOR_FINAL, digitoVerificacion, type DatosDocumento } from "../../src/services/facturacion/documento";

// Precios de carta con el INC (8%) incluido.
const base: DatosDocumento = {
  tipo: "FACTURA",
  numero: 990000123,
  prefijo: "SETP",
  companyId: "compania-prueba",
  resolucion: { numero: "18760000001", prefijo: "SETP", desde: 990000000, hasta: 995000000, fechaInicio: "2019-01-19", fechaFin: "2030-01-19", claveTecnica: "clave" },
  impuesto: "INC",
  impuestoPct: 8,
  adquiriente: CONSUMIDOR_FINAL,
  lineas: [
    { descripcion: "Hamburguesa", codigo: "h1", cantidad: 2, precioUnitario: 21600 },
    { descripcion: "Gaseosa", codigo: "g1", cantidad: 1, precioUnitario: 5400 },
  ],
  descuento: 0,
  propina: 0,
  envio: 0,
  pagos: [{ metodo: "EFECTIVO", monto: 48600 }],
  nota: "Mesa 1",
};

test("separa la base y el INC de los precios de la carta", () => {
  const t = calcularTotales(base);
  assert.equal(t.base, 45000);
  assert.equal(t.impuesto, 3600);
  assert.equal(t.aPagar, 48600);
  assert.deepEqual(
    t.lineas.map((l) => [l.precioBase, l.subtotal, l.impuesto]),
    [
      [20000, 40000, 3200],
      [5000, 5000, 400],
    ]
  );
});

test("el descuento de la cuenta se reparte en las líneas y baja la base del impuesto", () => {
  const t = calcularTotales({ ...base, descuento: 4860 });
  assert.equal(t.base, 40500);
  assert.equal(t.impuesto, 3240);
  assert.equal(t.aPagar, 43740);
  assert.equal(t.lineas[0].descuentoBase, 4000);
});

test("la propina va aparte, como cargo sin impuesto", () => {
  const doc = construirDocumento({ ...base, propina: 4860 }) as { totalAmounts: Record<string, number>; discountsAndCharges: Record<string, unknown>[] };
  assert.equal(doc.totalAmounts.taxTotal, 3600);
  assert.equal(doc.totalAmounts.chargeTotal, 4860);
  assert.equal(doc.totalAmounts.payableTotal, 53460);
  assert.equal(doc.discountsAndCharges[0].isCharge, true);
  assert.equal(doc.discountsAndCharges[0].percentageAmount, 10.8);
});

test("precios que no dan exacto: cada línea cuadra y el total queda a centavos del cobrado", () => {
  for (const precio of [7000, 7050, 12900, 3333]) {
    for (const descuento of [0, 1000]) {
      const t = calcularTotales({ ...base, descuento, lineas: [{ descripcion: "Perro", cantidad: 3, precioUnitario: precio }, { descripcion: "Agua", cantidad: 1, precioUnitario: 2500 }] });
      for (const l of t.lineas) {
        assert.equal(Math.round((l.precioBase * l.cantidad - l.descuentoBase) * 100), Math.round(l.subtotal * 100), `precio × cantidad − descuento = subtotal (${precio})`);
        assert.equal(Math.round(l.impuesto * 100), Math.round(l.subtotal * 8), `impuesto = 8% del subtotal (${precio})`);
      }
      assert.ok(Math.abs(t.aPagar - (precio * 3 + 2500 - descuento)) < 0.1, `total cercano a lo cobrado (${precio}, ${t.aPagar})`);
    }
  }
});

test("el domicilio entra como una línea más", () => {
  const t = calcularTotales({ ...base, envio: 5400 });
  assert.equal(t.lineas.at(-1)?.descripcion, "Servicio de domicilio");
  assert.equal(t.aPagar, 54000);
});

test("factura electrónica: tipo 01, resolución con clave técnica y consumidor final", () => {
  const doc = construirDocumento(base) as Record<string, any>;
  assert.equal(doc.documentType, "01");
  assert.equal(doc.resolution.technicalKey, "clave");
  assert.equal(doc.customer.identificationNumber, "222222222222");
  assert.equal(doc.payments[0].paymentMethod, "10");
  assert.equal(doc.items[0].taxes[0].taxCode, "04");
  assert.equal(doc.items[0].unitCode, "94");
});

test("documento POS: número como texto y datos de la caja", () => {
  const doc = construirDocumento({ ...base, tipo: "POS", caja: { placa: "CAJA1", ubicacion: "Local", cajero: "Ana", codigoVenta: "abc" } }) as Record<string, any>;
  assert.equal(doc.number, "990000123");
  assert.equal(doc.documentType, undefined);
  assert.equal(doc.cashRegister.plate, "CAJA1");
  assert.equal(doc.cashRegister.subtotal, "48600.00");
});

test("a nombre de una empresa: NIT con dígito de verificación", () => {
  const doc = construirDocumento({ ...base, adquiriente: { tipoIdentificacion: "31", numero: "900559088", dv: "2", nombre: "Empresa SAS", email: "a@b.co" } }) as Record<string, any>;
  assert.equal(doc.customer.organizationType, 1);
  assert.equal(doc.customer.dv, "2");
  assert.equal(doc.customer.email, "a@b.co");
});

test("sin impuesto (no responsable): sin tributos en las líneas", () => {
  const doc = construirDocumento({ ...base, impuesto: "NINGUNO" }) as Record<string, any>;
  assert.deepEqual(doc.items[0].taxes, []);
  assert.equal(doc.totalAmounts.taxableTotal, 0);
  assert.equal(doc.totalAmounts.payableTotal, 48600);
});

test("dígito de verificación del NIT", () => {
  assert.equal(digitoVerificacion("900559088"), "2");
  assert.equal(digitoVerificacion("900.559.088"), "2");
});
