import type { Metadata } from "next";
import { Bell, ChefHat, Plus } from "lucide-react";
import {
  Boton,
  CabeceraTarjeta,
  Campo,
  Contenedor,
  EncabezadoPagina,
  Entrada,
  Esqueleto,
  Insignia,
  PuntoVivo,
  Selector,
  Tarjeta,
} from "@/components/ui";

// Guía de estilo viva: muestra los tokens y componentes base en los dos temas.
// Sirve para revisar el sistema de diseño sin entrar a una pantalla con datos.
export const metadata: Metadata = { title: "Sistema de diseño · Comidas Rápidas", robots: { index: false } };

const COLORES = [
  ["background", "bg-background"],
  ["surface", "bg-surface"],
  ["surface-2", "bg-surface-2"],
  ["border", "bg-border"],
  ["accent", "bg-accent"],
  ["accent-2", "bg-accent-2"],
  ["exito", "bg-exito"],
  ["aviso", "bg-aviso"],
  ["peligro", "bg-peligro"],
  ["info", "bg-info"],
] as const;

function Muestra() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-5 gap-3">
        {COLORES.map(([nombre, clase]) => (
          <div key={nombre} className="grid gap-1.5">
            <div className={`h-12 rounded-xl border border-border ${clase}`} />
            <span className="truncate font-mono text-[11px] text-muted-foreground">{nombre}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Boton>
          <Plus /> Acción principal
        </Boton>
        <Boton variante="secundario">Secundaria</Boton>
        <Boton variante="fantasma">Fantasma</Boton>
        <Boton variante="exito" tamano="sm">
          Ya salió
        </Boton>
        <Boton variante="peligro" tamano="sm">
          Cancelar
        </Boton>
        <Boton cargando>Guardando</Boton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Insignia>Libre</Insignia>
        <Insignia tono="acento">Ocupada</Insignia>
        <Insignia tono="exito">
          <PuntoVivo /> Listo
        </Insignia>
        <Insignia tono="aviso">En preparación</Insignia>
        <Insignia tono="peligro">Atrasado</Insignia>
        <Insignia tono="info">Para llevar</Insignia>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta interactiva className="p-5">
          <CabeceraTarjeta
            titulo="Mesa 2"
            descripcion="4 puestos · Laura"
            acciones={
              <Insignia tono="exito">
                <ChefHat /> 1 listo
              </Insignia>
            }
          />
          <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">$ 46.000</p>
        </Tarjeta>
        <Tarjeta className="grid gap-3 p-5">
          <Esqueleto className="h-4 w-1/2" />
          <Esqueleto className="h-3 w-3/4" />
          <Esqueleto className="h-9 w-full" />
        </Tarjeta>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Correo" ayuda="El de tu cuenta de personal.">
          {(control) => <Entrada type="email" placeholder="nombre@restaurante.co" {...control} />}
        </Campo>
        <Campo etiqueta="Sede" error="Elige una sede.">
          {(control) => (
            <Selector defaultValue="" {...control}>
              <option value="">Selecciona…</option>
              <option>Centro</option>
            </Selector>
          )}
        </Campo>
      </div>

      <Tarjeta vidrio className="flex items-center justify-between p-4">
        <span className="text-sm font-medium">Panel de vidrio esmerilado</span>
        <Bell className="size-4 text-muted-foreground" />
      </Tarjeta>
    </div>
  );
}

export default function DisenoPage() {
  return (
    <Contenedor>
      <EncabezadoPagina
        antetitulo="Sistema de diseño"
        titulo="Tokens y componentes base"
        descripcion="Claro para mesero, administración y carta; oscuro profundo para cocina y pantalla. Las mismas clases sirven en los dos temas."
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="animate-aparecer rounded-3xl border border-border bg-background p-6 sm:p-8">
          <h2 className="mb-6 text-sm font-semibold text-muted-foreground">Tema claro</h2>
          <Muestra />
        </section>
        <section data-tema="oscuro" className="animate-aparecer rounded-3xl border border-border bg-background p-6 text-foreground [animation-delay:80ms] sm:p-8">
          <h2 className="mb-6 text-sm font-semibold text-muted-foreground">Tema oscuro (cocina y pantalla)</h2>
          <Muestra />
        </section>
      </div>
    </Contenedor>
  );
}
