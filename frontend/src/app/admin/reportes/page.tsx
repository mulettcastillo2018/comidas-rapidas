"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { ReporteVentasVista } from "@/components/reportes/ReporteVentasVista";
import { ReporteTiemposCocina } from "@/components/reportes/ReporteTiemposCocina";
import { ReporteOpiniones } from "@/components/reportes/ReporteOpiniones";

const VISTAS = [
  { id: "ventas", label: "Ventas" },
  { id: "opiniones", label: "Opiniones" },
  { id: "tiempos", label: "Tiempos de cocina" },
] as const;

export default function AdminReportesPage() {
  const token = useAuthStore((state) => state.token);
  const [vista, setVista] = useState<(typeof VISTAS)[number]["id"]>("ventas");

  if (!token) return null;

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-full bg-muted p-1 text-sm font-semibold sm:w-fit">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            onClick={() => setVista(v.id)}
            className={`flex-1 rounded-full px-4 py-1.5 sm:flex-none ${vista === v.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {vista === "ventas" ? (
        <ReporteVentasVista token={token} />
      ) : vista === "opiniones" ? (
        <ReporteOpiniones token={token} />
      ) : (
        <ReporteTiemposCocina token={token} />
      )}
    </div>
  );
}
