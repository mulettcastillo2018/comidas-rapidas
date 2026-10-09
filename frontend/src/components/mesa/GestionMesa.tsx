"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightLeft, UserPlus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Boton, CabeceraTarjeta, Entrada, Selector } from "@/components/ui";
import { ordenarMesas } from "@/lib/mesas";
import type { Mesa, MesaSesion } from "@/lib/types";

// Cambios a una mesa ya abierta: llega alguien más, o el grupo se pasa a
// otra mesa. Solo mientras no se haya generado la cuenta.
export function GestionMesa({
  sesion,
  token,
  usuarioId,
  esAdmin,
  onActualizada,
}: {
  sesion: MesaSesion;
  token: string;
  usuarioId: string;
  esAdmin: boolean;
  onActualizada: (sesion: MesaSesion, aviso: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [mesasLibres, setMesasLibres] = useState<Mesa[] | null>(null);
  const [destinoId, setDestinoId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comensales = sesion.comensales?.length ?? 0;
  const capacidad = sesion.mesa?.capacidad ?? 0;

  async function agregarComensal(event: FormEvent) {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return;
    // Igual que al abrir la mesa: superar el aforo requiere confirmar la silla.
    const necesitaSilla = comensales + 1 > capacidad + sesion.sillasAdicionales;
    if (necesitaSilla && !confirm(`La Mesa ${sesion.mesa?.numero} es para ${capacidad} y ya está llena. ¿Vas a traer una silla adicional?`)) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await apiFetch<MesaSesion>(`/mesa-sesiones/${sesion.id}/comensales`, {
        method: "POST",
        token,
        body: JSON.stringify({ nombre: limpio, confirmaSillaExtra: necesitaSilla }),
      });
      setNombre("");
      onActualizada(actualizada, `${limpio} se sumó a la mesa`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el comensal.");
    } finally {
      setGuardando(false);
    }
  }

  async function abrirCambioDeMesa() {
    setError(null);
    const mesas = await apiFetch<Mesa[]>("/mesas", { token });
    setMesasLibres(
      ordenarMesas(
        mesas.filter((m) => m.estado === "LIBRE" && (!m.meseroAsignadoId || m.meseroAsignadoId === sesion.meseroId || m.meseroAsignadoId === usuarioId || esAdmin))
      )
    );
    setDestinoId("");
  }

  async function mover() {
    const destino = mesasLibres?.find((m) => m.id === destinoId);
    if (!destino) return;
    const sillas = Math.max(0, comensales - destino.capacidad);
    const pregunta =
      sillas > 0
        ? `La Mesa ${destino.numero} es para ${destino.capacidad} y son ${comensales}. ¿Llevan ${sillas} silla(s) adicional(es)?`
        : `¿Pasar a todo el grupo, con sus pedidos, a la Mesa ${destino.numero}?`;
    if (!confirm(pregunta)) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await apiFetch<MesaSesion>(`/mesa-sesiones/${sesion.id}/mover`, {
        method: "PUT",
        token,
        body: JSON.stringify({ mesaId: destino.id, confirmaSillaExtra: sillas > 0 }),
      });
      setMesasLibres(null);
      onActualizada(actualizada, `Mesa cambiada a la ${destino.numero}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar de mesa.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 text-sm shadow-suave sm:p-6">
      <CabeceraTarjeta titulo="Gestión de la mesa" />
      <form onSubmit={agregarComensal} className="flex flex-wrap items-center gap-2">
        <Entrada
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Llegó alguien más: su nombre"
          aria-label="Nombre del comensal que llegó"
          className="min-w-0 flex-1 basis-48"
        />
        <Boton type="submit" variante="secundario" disabled={guardando || !nombre.trim()} className="text-accent">
          <UserPlus /> Agregar comensal
        </Boton>
      </form>

      {mesasLibres === null ? (
        <Boton variante="fantasma" tamano="sm" className="text-accent hover:text-accent" onClick={abrirCambioDeMesa}>
          <ArrowRightLeft /> Cambiar de mesa…
        </Boton>
      ) : mesasLibres.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay mesas libres ahora.{" "}
          <button onClick={() => setMesasLibres(null)} className="font-semibold text-accent">
            Cerrar
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Selector value={destinoId} onChange={(e) => setDestinoId(e.target.value)} contenedor="min-w-44 flex-1" aria-label="Mesa de destino">
            <option value="">Pasar a la mesa…</option>
            {mesasLibres.map((m) => (
              <option key={m.id} value={m.id}>
                Mesa {m.numero} ({m.capacidad} puestos)
              </option>
            ))}
          </Selector>
          <Boton onClick={mover} disabled={!destinoId || guardando}>
            Cambiar
          </Boton>
          <Boton variante="fantasma" onClick={() => setMesasLibres(null)}>
            Cancelar
          </Boton>
        </div>
      )}
      {error ? <p className="text-xs font-medium text-peligro">{error}</p> : null}
    </section>
  );
}
