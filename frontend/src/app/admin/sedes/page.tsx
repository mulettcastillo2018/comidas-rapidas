"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, MapPin, Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { olvidarSedes, type Sede, type SedesRespuesta } from "@/lib/sedes";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";

const campo = "w-full rounded-lg border border-border px-3 py-2 text-sm";

// Texto vacío = null; número vacío = null.
function leerFormulario(form: HTMLFormElement) {
  const valor = (nombre: string) => (form.elements.namedItem(nombre) as HTMLInputElement | null)?.value.trim() ?? "";
  const texto = (nombre: string) => valor(nombre) || null;
  const numero = (nombre: string) => (valor(nombre) ? Number(valor(nombre)) : null);
  return {
    nombre: valor("nombre"),
    direccion: texto("direccion"),
    posResolucion: texto("posResolucion"),
    posPrefijo: texto("posPrefijo"),
    posDesde: numero("posDesde"),
    posHasta: numero("posHasta"),
    posFechaInicio: texto("posFechaInicio"),
    posFechaFin: texto("posFechaFin"),
    posSiguiente: numero("posSiguiente"),
    cajaPlaca: texto("cajaPlaca"),
    cajaUbicacion: texto("cajaUbicacion"),
  };
}

// Sedes del negocio: cada una con sus mesas, su personal, su cocina, su
// inventario y su caja (con su numeración POS). La carta es la misma.
export default function AdminSedesPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [datos, setDatos] = useState<SedesRespuesta | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setDatos(await apiFetch<SedesRespuesta>("/sedes", { token }));
  }, [token]);

  useEffect(() => {
    cargar().catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las sedes."));
  }, [cargar]);

  async function guardar(ruta: string, method: "POST" | "PUT", cuerpo: object, mensaje: string) {
    if (!token) return false;
    setError(null);
    setGuardando(true);
    try {
      await apiFetch(ruta, { method, token, body: JSON.stringify(cuerpo) });
      olvidarSedes();
      await cargar();
      showToast(mensaje);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await guardar("/sedes", "POST", leerFormulario(form), "Sede creada")) {
      form.reset();
      setCreando(false);
    }
  }

  async function editar(sede: Sede, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cambios: Record<string, unknown> = leerFormulario(event.currentTarget);
    // El administrador de una sede no cambia el nombre (el servidor tampoco lo deja).
    if (!datos?.puedeCambiar) delete cambios.nombre;
    if (await guardar(`/sedes/${sede.id}`, "PUT", cambios, "Sede actualizada")) setEditando(null);
  }

  async function cambiarEstado(sede: Sede, cambios: { activa?: boolean; esPrincipal?: boolean }, pregunta: string) {
    if (!confirm(pregunta)) return;
    await guardar(`/sedes/${sede.id}`, "PUT", cambios, "Sede actualizada");
  }

  if (!datos) return error ? <p className="text-sm text-red-600">{error}</p> : null;
  const general = datos.puedeCambiar;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cada sede tiene sus mesas, su personal, su cocina, su inventario y su caja, con su propia numeración POS. La carta y los precios son los mismos en
        todas. {general ? "Elige en la barra de arriba la sede en la que estás trabajando." : null}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {datos.sedes.map((sede) => (
          <div key={sede.id} className={`rounded-xl border p-4 ${sede.activa ? "border-border" : "border-dashed border-border opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <MapPin size={16} className="text-accent" />
                  {sede.nombre}
                  {sede.esPrincipal ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      <Star size={10} /> principal
                    </span>
                  ) : null}
                  {!sede.activa ? <span className="text-xs text-red-600">(inactiva)</span> : null}
                  {sede.id === datos.actual ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">aquí estás</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {sede.direccion ?? "Sin dirección"} · {sede.mesas ?? 0} mesa(s) · {sede.personal ?? 0} persona(s)
                </p>
                <p className="text-sm text-muted-foreground">
                  POS: {sede.posPrefijo ? `${sede.posPrefijo} ${sede.posDesde}–${sede.posHasta}, siguiente ${sede.posSiguiente ?? sede.posDesde}` : "sin resolución"} · Caja:{" "}
                  {sede.cajaPlaca ? `${sede.cajaPlaca} (${sede.cajaUbicacion ?? "sin ubicación"})` : "sin datos"}
                </p>
                {sede.faltantesPos && sede.faltantesPos.length > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle size={12} /> Para el documento POS falta: {sede.faltantesPos.join(", ")}.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                <button onClick={() => setEditando(editando === sede.id ? null : sede.id)} className="text-accent">
                  Editar
                </button>
                {general && sede.activa && !sede.esPrincipal ? (
                  <button onClick={() => cambiarEstado(sede, { esPrincipal: true }, `¿Hacer de ${sede.nombre} la sede principal?`)} className="text-accent">
                    Hacer principal
                  </button>
                ) : null}
                {general && !sede.esPrincipal ? (
                  <button
                    onClick={() =>
                      cambiarEstado(
                        sede,
                        { activa: !sede.activa },
                        sede.activa ? `¿Desactivar ${sede.nombre}? Deja de aparecer para elegir y su QR de mostrador deja de funcionar.` : `¿Reactivar ${sede.nombre}?`
                      )
                    }
                    className="text-red-600"
                  >
                    {sede.activa ? "Desactivar" : "Reactivar"}
                  </button>
                ) : null}
              </div>
            </div>
            {editando === sede.id ? (
              <form onSubmit={(e) => editar(sede, e)} className="mt-3 border-t border-border pt-3">
                <CamposSede sede={sede} general={general} />
                <div className="mt-3 flex gap-2">
                  <button type="submit" disabled={guardando} className="btn-primary rounded-full px-5 py-1.5 text-sm disabled:opacity-50">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="rounded-full border border-border px-5 py-1.5 text-sm text-muted-foreground">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      {general ? (
        creando ? (
          <form onSubmit={crear} className="space-y-3 rounded-xl border border-border p-4">
            <h2 className="text-sm font-bold">Nueva sede</h2>
            <CamposSede general />
            <p className="text-xs text-muted-foreground">
              Después crea sus mesas (eligiéndola en la barra) y asigna su personal en Usuarios. La numeración POS y la caja se pueden completar luego.
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={guardando} className="btn-primary flex-1 rounded-full px-6 py-2 text-sm disabled:opacity-50">
                {guardando ? "Creando…" : "Crear sede"}
              </button>
              <button type="button" onClick={() => setCreando(false)} className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setCreando(true)} className="btn-primary rounded-full px-4 py-2 text-sm">
            + Nueva sede
          </button>
        )
      ) : null}
    </div>
  );
}

function CamposSede({ sede, general }: { sede?: Sede; general: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted-foreground">
          Nombre
          <input name="nombre" defaultValue={sede?.nombre} required minLength={2} maxLength={60} disabled={!general} className={`${campo} mt-1 disabled:bg-muted`} />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          Dirección
          <input name="direccion" defaultValue={sede?.direccion ?? ""} maxLength={200} className={`${campo} mt-1`} />
        </label>
      </div>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-bold">Documento equivalente POS (resolución de la DIAN para esta caja)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <input name="posResolucion" placeholder="N.º de resolución" defaultValue={sede?.posResolucion ?? ""} maxLength={14} className={campo} />
          <input name="posPrefijo" placeholder="Prefijo (p. ej. POS1)" defaultValue={sede?.posPrefijo ?? ""} maxLength={4} pattern="[A-Za-z0-9]{1,4}" className={campo} />
          <input name="posSiguiente" type="number" min={1} placeholder="Siguiente número (vacío = seguir)" defaultValue={sede?.posSiguiente ?? ""} className={campo} />
          <input name="posDesde" type="number" min={1} placeholder="Desde" defaultValue={sede?.posDesde ?? ""} className={campo} />
          <input name="posHasta" type="number" min={1} placeholder="Hasta" defaultValue={sede?.posHasta ?? ""} className={campo} />
          <span />
          <label className="text-xs text-muted-foreground">
            Vigente desde
            <input name="posFechaInicio" type="date" defaultValue={sede?.posFechaInicio ?? ""} className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-muted-foreground">
            hasta
            <input name="posFechaFin" type="date" defaultValue={sede?.posFechaFin ?? ""} className={`${campo} mt-1`} />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-bold">Caja registradora</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="cajaPlaca" placeholder="Placa o serial" defaultValue={sede?.cajaPlaca ?? ""} maxLength={50} className={campo} />
          <input name="cajaUbicacion" placeholder="Ubicación (p. ej. Local Centro)" defaultValue={sede?.cajaUbicacion ?? ""} maxLength={100} className={campo} />
        </div>
      </fieldset>
    </div>
  );
}
