"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { reemplazarPedidoActivo } from "@/lib/pedidos";
import { nombreCompleto } from "@/lib/nombre";
import { useAuthStore } from "@/store/auth.store";
import type { Pedido, PedidoItem } from "@/lib/types";

interface ItemParaLlevar extends PedidoItem {
  pedido: Pedido;
}

const ITEM_ESTADO_LABELS: Record<string, string> = {
  RECIBIDO: "En espera",
  EN_PREPARACION: "Preparando",
  LISTO: "Listo para entregar",
};

export default function AdminDomiciliosPage() {
  const token = useAuthStore((state) => state.token);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    cargarPedidos();

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con datos viejos en pantalla.
    return suscribirEnVivo(token, {
      connect: cargarPedidos,
      "pedido:nuevo": (pedido: Pedido) => setPedidos((prev) => reemplazarPedidoActivo(prev, pedido)),
      "pedido:actualizado": (pedido: Pedido) => setPedidos((prev) => reemplazarPedidoActivo(prev, pedido)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const itemsParaLlevar: ItemParaLlevar[] = pedidos.flatMap((pedido) =>
    pedido.items
      .filter((item) => item.paraLlevar && item.estado !== "CANCELADO" && item.estado !== "ENTREGADO")
      .map((item) => ({ ...item, pedido }))
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-bold">Vía WhatsApp</h2>
        <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no está construido. Cuando se implemente, los pedidos a domicilio que lleguen por WhatsApp
          aparecerán aquí.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-bold">Para llevar (mesas abiertas)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Productos que un cliente pidió para llevar mientras sigue en su mesa (ej. algo para alguien que no vino).
          Se actualiza sola, no hace falta refrescar.
        </p>

        {itemsParaLlevar.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No hay pedidos para llevar en este momento.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {itemsParaLlevar.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <div>
                  <p className="font-semibold">
                    {item.cantidad}× {item.producto?.nombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Mesa {item.pedido.mesaSesion?.mesa?.numero} · Mesero:{" "}
                    {nombreCompleto(item.pedido.mesaSesion?.mesero) || "—"}
                  </p>
                  {item.notas ? <p className="text-xs text-muted-foreground">{item.notas}</p> : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.estado === "LISTO" ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {ITEM_ESTADO_LABELS[item.estado] ?? item.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
