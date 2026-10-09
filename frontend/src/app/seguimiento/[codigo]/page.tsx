"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Flame, PartyPopper, Star, TriangleAlert } from "lucide-react";
import { cx, estilosBoton, Esqueleto, Insignia, type TonoInsignia } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { playForTipo, unlockAudio } from "@/lib/notificationSound";
import { formatoHora } from "@/lib/tiempoEstimado";
import { LlamarMesero } from "@/components/LlamarMesero";

type Etapa = "ESPERANDO_CONFIRMACION" | "VENCIDA" | "DESCARTADA" | "EN_COCINA" | "LISTO" | "ENTREGADO" | "CANCELADO";

interface Seguimiento {
  canal: "MESA" | "MOSTRADOR";
  mesaId: string | null;
  mesaNumero: string | null;
  nombre: string;
  creadaEn: string;
  etapa: Etapa;
  items: { nombre: string; cantidad: number; estado: string }[];
  minutosPreparacion: number;
  listoEstimadoEn: string | null;
}

const INTERVALO_MS = 10_000;
const ETAPAS_FINALES: Etapa[] = ["ENTREGADO", "CANCELADO", "DESCARTADA", "VENCIDA"];
const PASOS = ["Enviado", "Confirmado", "En preparación", "Listo"];
const PASO_POR_ETAPA: Partial<Record<Etapa, number>> = { ESPERANDO_CONFIRMACION: 0, EN_COCINA: 2, LISTO: 3, ENTREGADO: 4 };

const ITEM_TONO: Record<string, TonoInsignia> = { PENDIENTE: "neutro", RECIBIDO: "info", EN_PREPARACION: "aviso", LISTO: "exito", ENTREGADO: "neutro", CANCELADO: "peligro" };

const ITEM_LABEL: Record<string, string> = {
  PENDIENTE: "Por confirmar",
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

function mensaje(s: Seguimiento, ahora: number): { titulo: string; detalle: string } {
  const enMesa = s.canal === "MESA";
  switch (s.etapa) {
    case "ESPERANDO_CONFIRMACION":
      return enMesa
        ? { titulo: "Esperando a tu mesero", detalle: `Apenas llegue a la Mesa ${s.mesaNumero} lo confirmará y lo enviará a cocina.` }
        : {
            titulo: "Acércate a caja para confirmar y pagar",
            detalle: `Después de pagar, la preparación toma unos ${s.minutosPreparacion} minutos.`,
          };
    case "EN_COCINA": {
      const eta = s.listoEstimadoEn ? new Date(s.listoEstimadoEn).getTime() : null;
      if (eta && eta > ahora) {
        return { titulo: "Estamos preparando tu pedido", detalle: `Estará listo aproximadamente a las ${formatoHora(s.listoEstimadoEn!)}.` };
      }
      return { titulo: "Estamos preparando tu pedido", detalle: "Está tomando un poco más de lo previsto, ya casi está." };
    }
    case "LISTO":
      return enMesa
        ? { titulo: "¡Tu pedido está listo!", detalle: "Tu mesero te lo lleva en un momento." }
        : { titulo: "¡Tu pedido está listo!", detalle: "Recógelo en caja." };
    case "ENTREGADO":
      return { titulo: "Pedido entregado", detalle: "¡Buen provecho!" };
    case "CANCELADO":
      return { titulo: "Tu pedido fue cancelado", detalle: enMesa ? "Si tienes dudas, pregúntale a tu mesero." : "Si tienes dudas, pregunta en caja." };
    case "DESCARTADA":
      return { titulo: "Tu pedido no fue confirmado", detalle: enMesa ? "Habla con tu mesero para hacer tu pedido." : "Pregunta en caja." };
    case "VENCIDA":
      return {
        titulo: "Tu pedido venció",
        detalle: "Nadie lo confirmó en una hora. Si todavía quieres pedir, hazlo de nuevo o habla con el personal.",
      };
  }
}

export default function SeguimientoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const etapaAnterior = useRef<Etapa | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activo = true;

    async function consultar() {
      try {
        const data = await apiFetch<Seguimiento>(`/seguimiento/${codigo}`);
        if (!activo) return;
        // Aviso al pasar a "listo": sonido (si el navegador lo permite),
        // vibración y el título de la pestaña, por si tiene otra app abierta.
        if (data.etapa === "LISTO" && etapaAnterior.current && etapaAnterior.current !== "LISTO") {
          playForTipo("ITEM_LISTO");
          navigator.vibrate?.([200, 100, 200]);
        }
        etapaAnterior.current = data.etapa;
        document.title = data.etapa === "LISTO" ? "✅ ¡Tu pedido está listo!" : "Tu pedido — Comidas Rápidas";
        setDatos(data);
        setError(null);
        setAhora(Date.now());
        if (!ETAPAS_FINALES.includes(data.etapa)) timer = setTimeout(consultar, INTERVALO_MS);
      } catch (err) {
        if (!activo) return;
        if (err instanceof ApiError && err.status === 404) {
          setError(err.message);
          return;
        }
        // Sin conexión o servidor caído: se reintenta sin borrar lo que ya se ve.
        setError("Sin conexión en este momento. Reintentando…");
        timer = setTimeout(consultar, INTERVALO_MS);
      }
    }

    consultar();
    return () => {
      activo = false;
      clearTimeout(timer);
    };
  }, [codigo]);

  if (!datos) {
    return (
      <div className="mx-auto grid max-w-md gap-4 px-4 py-16 text-center text-sm text-muted-foreground">
        {error ? (
          <p>{error}</p>
        ) : (
          <>
            <p className="sr-only">Cargando tu pedido…</p>
            <Esqueleto className="mx-auto h-7 w-48" />
            <Esqueleto className="h-28 rounded-3xl" />
            <Esqueleto className="h-40 rounded-3xl" />
          </>
        )}
      </div>
    );
  }

  const { titulo, detalle } = mensaje(datos, ahora);
  const paso = PASO_POR_ETAPA[datos.etapa];
  const problema = datos.etapa === "CANCELADO" || datos.etapa === "DESCARTADA" || datos.etapa === "VENCIDA";

  return (
    <div className="mx-auto max-w-md px-4 pt-8 pb-12 sm:pt-12" onClick={unlockAudio}>
      <header className="text-center">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento">
          <Flame className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="brand-gradient-text">Comidas Rápidas</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {datos.canal === "MESA" ? `Mesa ${datos.mesaNumero}` : "Pedido para recoger"}
          {datos.nombre ? ` · ${datos.nombre}` : ""}
        </p>
      </header>

      <div
        key={datos.etapa}
        className={cx(
          "mt-6 animate-emerger rounded-3xl border p-6 text-center shadow-elevada",
          datos.etapa === "LISTO"
            ? "border-exito/40 bg-exito/[0.08] shadow-[0_0_48px_-16px] shadow-exito/50"
            : problema
              ? "border-peligro/40 bg-peligro/[0.06]"
              : "border-border bg-surface",
        )}
      >
        {datos.etapa === "LISTO" ? <PartyPopper className="mx-auto mb-2 size-8 text-exito" aria-hidden /> : null}
        {problema ? <TriangleAlert className="mx-auto mb-2 size-7 text-peligro" aria-hidden /> : null}
        <p className={cx("text-xl font-semibold tracking-tight", datos.etapa === "LISTO" && "text-exito", problema && "text-peligro")}>{titulo}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{detalle}</p>
      </div>

      {datos.etapa === "ENTREGADO" && datos.canal === "MOSTRADOR" ? (
        <Link href={`/encuesta/${codigo}`} className={estilosBoton({ tamano: "lg", bloque: true, variante: "primario" }) + " mt-4"}>
          <Star /> ¿Cómo te fue? Califícanos
        </Link>
      ) : null}
      {datos.canal === "MESA" && datos.mesaId && !ETAPAS_FINALES.includes(datos.etapa) ? (
        <div className="mt-4">
          <LlamarMesero mesaId={datos.mesaId} />
        </div>
      ) : null}

      {paso !== undefined ? (
        <ol className="mt-8 flex items-start">
          {PASOS.map((nombre, i) => {
            const hecho = i < paso || paso === 4;
            const actual = i === paso;
            return (
              <li key={nombre} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
                {i > 0 ? (
                  <span
                    className={cx("absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 transition-colors duration-500", hecho || actual ? "bg-accent" : "bg-border")}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cx(
                    "relative grid size-7 place-items-center rounded-full text-xs font-semibold transition-all duration-500 ease-resorte",
                    hecho ? "bg-accent text-accent-foreground" : actual ? "bg-background text-accent shadow-[0_0_0_5px] shadow-accent/15 ring-2 ring-accent" : "bg-surface-2 text-muted-foreground ring-1 ring-border",
                  )}
                >
                  {hecho ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cx("text-[11px]", actual ? "font-semibold text-foreground" : "text-muted-foreground")}>{nombre}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <ul className="mt-8 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface text-sm shadow-suave">
        {datos.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-2 px-4 py-3">
            <span className={item.estado === "CANCELADO" ? "text-muted-foreground line-through" : ""}>
              <span className="font-semibold tabular-nums">{item.cantidad}×</span> {item.nombre}
            </span>
            <Insignia tono={ITEM_TONO[item.estado] ?? "neutro"} className="shrink-0">
              {ITEM_LABEL[item.estado] ?? item.estado}
            </Insignia>
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-center text-xs font-medium text-aviso">{error}</p> : null}
      {!ETAPAS_FINALES.includes(datos.etapa) ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">Esta página se actualiza sola. Puedes dejarla abierta.</p>
      ) : null}

      <div className="mt-6 text-center">
        <Link
          href={datos.canal === "MESA" && datos.mesaId ? `/carta?mesa=${datos.mesaId}` : "/carta?recoger=1"}
          className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 ease-resorte group-hover:-translate-x-0.5" aria-hidden />
          Volver a la carta
        </Link>
      </div>
    </div>
  );
}
