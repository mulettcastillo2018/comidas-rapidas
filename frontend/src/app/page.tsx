import { Building2, ChefHat, ConciergeBell, MonitorPlay, QrCode, Receipt } from "lucide-react";
import { AccesoInicio } from "@/components/AccesoInicio";
import { cx, Insignia, PuntoVivo } from "@/components/ui";

// Inicio: qué hace el sistema, en una grilla tipo bento con un bloque por módulo.

function Modulo({
  icono: Icono,
  titulo,
  texto,
  className,
  retraso,
  children,
}: {
  icono: typeof ChefHat;
  titulo: string;
  texto: string;
  className?: string;
  retraso: number;
  children?: React.ReactNode;
}) {
  return (
    <article
      style={{ animationDelay: `${retraso}ms` }}
      className={cx(
        "group relative flex animate-aparecer flex-col overflow-hidden rounded-3xl border border-border bg-surface p-6 text-foreground shadow-suave transition-[transform,box-shadow,border-color] duration-500 ease-salida hover:-translate-y-1 hover:border-border-strong hover:shadow-elevada sm:p-7",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/15 transition-transform duration-500 ease-resorte ring-inset group-hover:scale-110 group-hover:-rotate-3">
        <Icono className="size-5" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-pretty text-muted-foreground">{texto}</p>
      {children}
    </article>
  );
}

// Miniatura de las mesas del mesero: ilustra el módulo sin datos reales.
const MESAS = [
  { nombre: "Mesa 1", estado: "Libre", tono: "neutro" },
  { nombre: "Mesa 2", estado: "1 listo", tono: "exito" },
  { nombre: "Mesa 3", estado: "Ocupada", tono: "acento" },
  { nombre: "Mesa 4", estado: "Libre", tono: "neutro" },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-12 pb-20 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
      <section className="mx-auto max-w-3xl animate-aparecer text-center">
        <Insignia tono="acento" className="mb-6">
          <PuntoVivo tono="acento" />
          Sala, cocina y caja en tiempo real
        </Insignia>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Cada pedido, de la mesa a la cocina <span className="brand-gradient-text">sin perderse</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          Comidas Rápidas organiza el servicio de un restaurante: el mesero toma el pedido por comensal, la cocina lo despacha producto por producto y la caja cierra
          el día con sus cuentas claras.
        </p>
        <div className="mt-8 flex justify-center">
          <AccesoInicio />
        </div>
      </section>

      <section aria-label="Módulos" className="mt-16 grid grid-cols-1 gap-4 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        <Modulo
          icono={ConciergeBell}
          titulo="Mesero"
          texto="Mesas, comensales y pedidos por persona. El cliente también pide desde el QR y el mesero confirma."
          className="sm:col-span-2 lg:row-span-2"
          retraso={60}
        >
          <div className="mt-6 grid flex-1 grid-cols-2 content-end gap-3" aria-hidden>
            {MESAS.map((mesa) => (
              <div key={mesa.nombre} className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-sm font-semibold">{mesa.nombre}</p>
                <Insignia tono={mesa.tono} className="mt-2">
                  {mesa.estado}
                </Insignia>
              </div>
            ))}
          </div>
        </Modulo>

        <div data-tema="oscuro" className="contents">
          <Modulo
            icono={ChefHat}
            titulo="Cocina"
            texto="Despacho producto por producto, con tiempos estimados y alerta cuando algo se atrasa."
            className="bg-background lg:col-span-2"
            retraso={120}
          />
        </div>

        <Modulo icono={MonitorPlay} titulo="Pantalla del salón" texto="El estado de cada pedido para los clientes, con nombres cortos." retraso={180} />
        <Modulo icono={QrCode} titulo="Carta QR" texto="Pedidos desde la mesa o el mostrador, llamado al mesero y encuesta." retraso={240} />
        <Modulo
          icono={Receipt}
          titulo="Caja y reportes"
          texto="Cierre de caja, ventas, gastos, propinas y punto de equilibrio."
          className="lg:col-span-2"
          retraso={300}
        />
        <Modulo
          icono={Building2}
          titulo="Varias sedes"
          texto="Inventario, numeración y caja por sede; factura electrónica con Alanube."
          className="sm:col-span-2"
          retraso={360}
        />
      </section>
    </div>
  );
}
