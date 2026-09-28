// Arma el cuerpo que se envía a Alanube (API de facturación electrónica de
// Alegra para la DIAN) a partir de una cuenta cobrada. Función pura: no toca
// la base de datos, así se puede probar sola.
//
// Los precios de la carta ya incluyen el impuesto (INC 8% en restaurantes):
// aquí se separan en base + impuesto, que es como los pide la DIAN. Todo se
// calcula en centavos para no acumular errores de redondeo.

import type { ImpuestoVenta, MetodoPago, TipoDocumentoFiscal } from "@prisma/client";
import { repartirProporcional } from "../lineasPedido";

export interface LineaVenta {
  descripcion: string;
  codigo?: string;
  cantidad: number;
  // Precio por unidad en pesos, con el impuesto incluido (como en la carta).
  precioUnitario: number;
}

export interface Adquiriente {
  // 13 cédula, 31 NIT, 22 cédula de extranjería, 41 pasaporte, 12 tarjeta de identidad.
  tipoIdentificacion: string;
  numero: string;
  dv?: string | null;
  nombre: string;
  email?: string | null;
}

// Quien no pide la factura a su nombre (DIAN: 222222222222).
export const CONSUMIDOR_FINAL: Adquiriente = { tipoIdentificacion: "13", numero: "222222222222", nombre: "Consumidor final" };

export interface Resolucion {
  numero: string;
  prefijo: string;
  desde: number;
  hasta: number;
  fechaInicio: string;
  fechaFin: string;
  claveTecnica?: string | null;
}

export interface DatosDocumento {
  tipo: TipoDocumentoFiscal;
  numero: number;
  prefijo: string;
  companyId: string;
  resolucion: Resolucion | null;
  impuesto: ImpuestoVenta;
  impuestoPct: number;
  adquiriente: Adquiriente;
  lineas: LineaVenta[];
  // En pesos, como quedaron en la cuenta.
  descuento: number;
  propina: number;
  envio: number;
  pagos: { metodo: MetodoPago; monto: number }[];
  nota: string;
  // Solo POS: caja y quién cobró.
  caja?: { placa: string; ubicacion: string; cajero: string; codigoVenta: string };
  // Solo POS: puntos del cliente frecuente ("beneficios del comprador").
  beneficios?: { identificacion: string; nombre: string; puntos: number };
  // Solo notas: el documento que se anula.
  referencia?: { alanubeId: string | null; numeroCompleto: string; codigoUnico: string | null; fecha: string; tipo: TipoDocumentoFiscal };
  motivo?: string;
}

// Códigos de medios de pago de la DIAN.
const MEDIO_PAGO_DIAN: Record<MetodoPago, string> = {
  EFECTIVO: "10",
  TARJETA: "48",
  NEQUI: "47",
  DAVIPLATA: "47",
  TRANSFERENCIA: "47",
  OTRO: "ZZZ",
  PLATAFORMA: "ZZZ",
};

// Códigos de tributo de la DIAN.
const CODIGO_TRIBUTO: Record<ImpuestoVenta, string> = { IVA: "01", INC: "04", NINGUNO: "ZZ" };

const aPesos = (centavos: number) => Math.round(centavos) / 100;

export interface LineaCalculada {
  descripcion: string;
  codigo?: string;
  cantidad: number;
  precioBase: number;
  descuentoBase: number;
  subtotal: number;
  impuesto: number;
  total: number;
}

export interface Totales {
  lineas: LineaCalculada[];
  base: number;
  impuesto: number;
  propina: number;
  aPagar: number;
}

// Separa base e impuesto de cada línea; el descuento de la cuenta se reparte
// entre las líneas (así también baja la base del impuesto) y la propina va
// aparte, como cargo: no es venta y no lleva impuesto.
export function calcularTotales(d: Pick<DatosDocumento, "lineas" | "descuento" | "propina" | "envio" | "impuestoPct" | "impuesto">): Totales {
  const pct = d.impuesto === "NINGUNO" ? 0 : d.impuestoPct;
  const lineas: LineaVenta[] = d.envio > 0 ? [...d.lineas, { descripcion: "Servicio de domicilio", codigo: "DOMICILIO", cantidad: 1, precioUnitario: d.envio }] : d.lineas;
  const brutos = lineas.map((l) => l.precioUnitario * l.cantidad * 100);
  const descuentos = repartirProporcional(Math.min(d.descuento, brutos.reduce((s, b) => s + b, 0) / 100) * 100, brutos);

  const calculadas = lineas.map((l, i): LineaCalculada => {
    const precioBaseCent = Math.round((l.precioUnitario * 100) / (1 + pct / 100));
    const baseBruta = precioBaseCent * l.cantidad;
    // Precio × cantidad − descuento = subtotal, exacto al centavo (la DIAN
    // lo valida así).
    const baseNeta = descuentos[i] > 0 ? Math.min(baseBruta, Math.round((brutos[i] - descuentos[i]) / (1 + pct / 100))) : baseBruta;
    const impuesto = Math.round((baseNeta * pct) / 100);
    return {
      descripcion: l.descripcion,
      codigo: l.codigo,
      cantidad: l.cantidad,
      precioBase: aPesos(precioBaseCent),
      descuentoBase: aPesos(Math.max(0, baseBruta - baseNeta)),
      subtotal: aPesos(baseNeta),
      impuesto: aPesos(impuesto),
      total: aPesos(baseNeta + impuesto),
    };
  });
  const suma = (valores: number[]) => Math.round(valores.reduce((s, v) => s + v * 100, 0));
  const base = suma(calculadas.map((l) => l.subtotal));
  const impuesto = suma(calculadas.map((l) => l.impuesto));
  const propina = d.propina * 100;
  return { lineas: calculadas, base: aPesos(base), impuesto: aPesos(impuesto), propina: aPesos(propina), aPagar: aPesos(base + impuesto + propina) };
}

function cliente(a: Adquiriente) {
  const esEmpresa = a.tipoIdentificacion === "31";
  return {
    name: a.nombre,
    organizationType: esEmpresa ? 1 : 2,
    identificationType: a.tipoIdentificacion,
    identificationNumber: a.numero,
    ...(esEmpresa && a.dv ? { dv: a.dv } : {}),
    taxCode: { id: "ZZ" },
    ...(a.email ? { email: a.email } : {}),
  };
}

export function construirDocumento(d: DatosDocumento): Record<string, unknown> {
  const pct = d.impuesto === "NINGUNO" ? 0 : d.impuestoPct;
  const t = calcularTotales(d);
  const items = t.lineas.map((l) => ({
    ...(l.codigo ? { sellersItemIdentification: { id: l.codigo.slice(0, 50) } } : {}),
    description: l.descripcion,
    price: l.precioBase,
    quantity: l.cantidad,
    unitCode: "94",
    ...(l.descuentoBase > 0 ? { discountAmount: l.descuentoBase } : {}),
    subtotal: l.subtotal,
    taxAmount: l.impuesto,
    total: l.total,
    taxes: pct > 0 ? [{ taxCode: CODIGO_TRIBUTO[d.impuesto], taxPercentage: pct.toFixed(2), taxableAmount: l.subtotal, taxAmount: l.impuesto }] : [],
  }));
  const metodos = [...new Set(d.pagos.map((p) => p.metodo))];
  const comun = {
    company: { id: d.companyId },
    customer: cliente(d.adquiriente),
    items,
    totalAmounts: {
      grossTotal: t.base,
      taxableTotal: pct > 0 ? t.base : 0,
      taxTotal: t.impuesto,
      discountTotal: 0,
      chargeTotal: t.propina,
      payableTotal: t.aPagar,
      currencyCode: "COP",
    },
    payments: (metodos.length > 0 ? metodos : (["EFECTIVO"] as MetodoPago[])).map((m) => ({ paymentForm: "1", paymentMethod: MEDIO_PAGO_DIAN[m] })),
    ...(t.propina > 0
      ? {
          discountsAndCharges: [
            {
              isCharge: true,
              baseAmount: t.base,
              percentageAmount: t.base > 0 ? Math.round((t.propina / t.base) * 10000) / 100 : 0,
              amount: t.propina,
              reason: "Propina voluntaria",
            },
          ],
        }
      : {}),
    note: [d.nota],
  };
  const resolucion = d.resolucion
    ? {
        resolutionNumber: d.resolucion.numero,
        prefix: d.prefijo,
        minNumber: d.resolucion.desde,
        maxNumber: d.resolucion.hasta,
        startDate: d.resolucion.fechaInicio,
        endDate: d.resolucion.fechaFin,
        ...(d.resolucion.claveTecnica ? { technicalKey: d.resolucion.claveTecnica } : {}),
      }
    : undefined;

  switch (d.tipo) {
    case "FACTURA":
      return { documentType: "01", number: d.numero, resolution: resolucion, ...comun };
    case "POS":
      return {
        number: String(d.numero),
        resolution: resolucion,
        ...comun,
        cashRegister: {
          plate: d.caja?.placa ?? "",
          location: d.caja?.ubicacion ?? "",
          cashier: d.caja?.cajero ?? "",
          type: "POS",
          saleCode: d.caja?.codigoVenta ?? "",
          subtotal: t.aPagar.toFixed(2),
        },
        ...(d.beneficios ? { buyerBenefits: { identification: d.beneficios.identificacion, name: d.beneficios.nombre, points: String(d.beneficios.puntos) } } : {}),
      };
    case "NOTA_CREDITO":
      return {
        documentType: "01",
        number: d.numero,
        resolution: resolucion,
        ...comun,
        creditNoteReference: d.referencia?.alanubeId
          ? { id: d.referencia.alanubeId }
          : { fullNumber: d.referencia?.numeroCompleto, cude: d.referencia?.codigoUnico, date: d.referencia?.fecha },
        note: [d.motivo ?? "Anulación", d.nota],
      };
    case "NOTA_AJUSTE":
      return {
        number: String(d.numero),
        ...comun,
        documentReference: {
          ...(d.referencia?.alanubeId ? { id: d.referencia.alanubeId } : {}),
          fullNumber: d.referencia?.numeroCompleto,
          cude: d.referencia?.codigoUnico,
          issueDate: d.referencia?.fecha,
        },
        // 2 = anulación del documento equivalente.
        discrepancy: { responseCode: 2, description: d.motivo ?? "Anulación" },
      };
  }
}

// Dígito de verificación del NIT (algoritmo de la DIAN).
export function digitoVerificacion(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digitos = nit.replace(/\D/g, "").split("").reverse();
  const suma = digitos.reduce((s, dig, i) => s + Number(dig) * (pesos[i] ?? 0), 0);
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}
