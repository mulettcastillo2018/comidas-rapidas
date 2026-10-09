"use client";

import { Segmentado } from "@/components/ui";
import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { ReporteVentasVista } from "@/components/reportes/ReporteVentasVista";
import { ReporteTiemposCocina } from "@/components/reportes/ReporteTiemposCocina";
import { ReporteOpiniones } from "@/components/reportes/ReporteOpiniones";
import { ReporteResultados } from "@/components/reportes/ReporteResultados";
import { AlcanceSedes } from "@/components/SelectorSede";

const VISTAS = [
  { id: "ventas", label: "Ventas" },
  { id: "resultados", label: "Resultados" },
  { id: "opiniones", label: "Opiniones" },
  { id: "tiempos", label: "Tiempos de cocina" },
] as const;

export default function AdminReportesPage() {
  const token = useAuthStore((state) => state.token);
  const [vista, setVista] = useState<(typeof VISTAS)[number]["id"]>("ventas");

  if (!token) return null;

  return (
    <div className="space-y-6">
      <AlcanceSedes />
      <Segmentado etiqueta="Reportes" opciones={VISTAS} valor={vista} onCambio={setVista} />
      {vista === "ventas" ? (
        <ReporteVentasVista token={token} />
      ) : vista === "resultados" ? (
        <ReporteResultados token={token} />
      ) : vista === "opiniones" ? (
        <ReporteOpiniones token={token} />
      ) : (
        <ReporteTiemposCocina token={token} />
      )}
    </div>
  );
}
