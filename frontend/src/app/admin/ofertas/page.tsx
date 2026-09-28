"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { AdicionesAdmin, type AdicionAdmin } from "@/components/admin/AdicionesAdmin";
import { PromocionesAdmin, type PromocionAdmin } from "@/components/admin/PromocionesAdmin";
import type { Categoria, Producto } from "@/lib/types";

// Adiciones y promociones. Los combos se crean en Productos (son productos).
export default function AdminOfertasPage() {
  const token = useAuthStore((state) => state.token);
  const [adiciones, setAdiciones] = useState<AdicionAdmin[]>([]);
  const [promociones, setPromociones] = useState<PromocionAdmin[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  async function cargar() {
    if (!token) return;
    const [a, p, pr, c] = await Promise.all([
      apiFetch<AdicionAdmin[]>("/adiciones", { token }),
      apiFetch<PromocionAdmin[]>("/promociones", { token }),
      apiFetch<Producto[]>("/productos", { token }),
      apiFetch<Categoria[]>("/categorias", { token }),
    ]);
    setAdiciones(a);
    setPromociones(p);
    setProductos(pr);
    setCategorias(c);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  return (
    <div className="space-y-10">
      <p className="text-sm text-muted-foreground">
        Adiciones para cobrar los extras (y dejar estructuradas opciones como &quot;sin cebolla&quot;) y promociones por
        horario. Los <strong>combos</strong> se crean en Productos, marcando &quot;Es un combo&quot;.
      </p>
      <AdicionesAdmin token={token} adiciones={adiciones} productos={productos} onCambio={cargar} />
      <PromocionesAdmin token={token} promociones={promociones} productos={productos} categorias={categorias} onCambio={cargar} />
    </div>
  );
}
