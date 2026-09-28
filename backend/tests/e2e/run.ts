// Suite de extremo a extremo contra un backend corriendo. Ver tests/README.md.
import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { comprobarEntorno, totalFallos } from "./_utilidades";
import { probarIntegridad } from "./integridad.e2e";
import { probarRobustez } from "./robustez.e2e";
import { probarVentasYCaja } from "./ventas-caja.e2e";
import { probarSeguimiento } from "./seguimiento.e2e";
import { probarOperacion } from "./operacion.e2e";
import { probarNotificaciones } from "./notificaciones.e2e";
import { probarDinero } from "./dinero.e2e";
import { probarControl } from "./control.e2e";
import { probarExperiencia } from "./experiencia.e2e";
import { probarOfertas } from "./ofertas.e2e";
import { probarDomicilios } from "./domicilios.e2e";
import { probarGestion } from "./gestion.e2e";
import { probarFacturacion } from "./facturacion.e2e";

const PRUEBAS: [string, () => Promise<void>][] = [
  ["Integridad y sesiones", probarIntegridad],
  ["Robustez", probarRobustez],
  ["Ventas y caja", probarVentasYCaja],
  ["Seguimiento y datos personales", probarSeguimiento],
  ["Operación diaria", probarOperacion],
  ["Notificaciones que llevan a su pantalla", probarNotificaciones],
  ["Dinero: costos, pagos y caja", probarDinero],
  ["Control: clave de supervisor e inventario", probarControl],
  ["Experiencia del cliente y demanda", probarExperiencia],
  ["Ofertas: adiciones, combos, promociones y descuentos", probarOfertas],
  ["Domicilios y apps", probarDomicilios],
  ["Gestión: gastos, resultados, turnos y propinas", probarGestion],
  ["Facturación electrónica (Alanube simulado)", probarFacturacion],
];

async function main() {
  comprobarEntorno();
  // Filtro opcional por nombre: npm run test:e2e -- caja
  const filtro = process.argv[2]?.toLowerCase();
  let errores = 0;
  for (const [nombre, probar] of PRUEBAS) {
    if (filtro && !nombre.toLowerCase().includes(filtro)) continue;
    console.log(`\n=== ${nombre} ===`);
    try {
      await probar();
    } catch (err) {
      errores++;
      console.error("  ERROR:", err);
    }
  }
  const fallos = totalFallos() + errores;
  console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`} — datos de prueba eliminados.`);
  return fallos;
}

main()
  .then(async (fallos) => {
    await prisma.$disconnect();
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err.message ?? err);
    await prisma.$disconnect();
    process.exit(1);
  });
