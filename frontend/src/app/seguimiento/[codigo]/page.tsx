"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { playForTipo, unlockAudio } from "@/lib/notificationSound";
import { formatoHora } from "@/lib/tiempoEstimado";

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
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-muted-foreground">{error ?? "Cargando tu pedido…"}</div>
    );
  }

  const { titulo, detalle } = mensaje(datos, ahora);
  const paso = PASO_POR_ETAPA[datos.etapa];
  const problema = datos.etapa === "CANCELADO" || datos.etapa === "DESCARTADA" || datos.etapa === "VENCIDA";

  return (
    <div className="mx-auto max-w-md px-4 py-10" onClick={unlockAudio}>
      <h1 className="brand-gradient-text text-center text-2xl font-extrabold tracking-tight">Comidas Rápidas</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {datos.canal === "MESA" ? `Mesa ${datos.mesaNumero}` : "Pedido para recoger"}
        {datos.nombre ? ` · ${datos.nombre}` : ""}
      </p>

      <div
        className={`mt-6 rounded-2xl border-2 p-5 text-center ${
          datos.etapa === "LISTO" ? "border-accent bg-accent/10" : problema ? "border-red-600" : "border-border"
        }`}
      >
        <p className={`text-xl font-extrabold ${datos.etapa === "LISTO" ? "text-accent" : problema ? "text-red-600" : ""}`}>{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detalle}</p>
      </div>

      {paso !== undefined ? (
        <ol className="mt-6 flex items-start justify-between">
          {PASOS.map((nombre, i) => {
            const hecho = i < paso || paso === 4;
            const actual = i === paso;
            return (
              <li key={nombre} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    hecho ? "bg-accent text-white" : actual ? "animate-pulse bg-accent/20 text-accent ring-2 ring-accent" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {hecho ? <Check size={14} /> : i + 1}
                </span>
                <span className={`text-[11px] ${actual ? "font-semibold" : "text-muted-foreground"}`}>{nombre}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border text-sm">
        {datos.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className={item.estado === "CANCELADO" ? "text-muted-foreground line-through" : ""}>
              {item.cantidad}× {item.nombre}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {ITEM_LABEL[item.estado] ?? item.estado}
            </span>
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-center text-xs text-amber-600">{error}</p> : null}
      {!ETAPAS_FINALES.includes(datos.etapa) ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">Esta página se actualiza sola. Puedes dejarla abierta.</p>
      ) : null}

      <div className="mt-6 text-center">
        <Link
          href={datos.canal === "MESA" && datos.mesaId ? `/carta?mesa=${datos.mesaId}` : "/carta?recoger=1"}
          className="text-sm font-semibold text-accent"
        >
          Volver a la carta
        </Link>
      </div>
    </div>
  );
}
