"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { reemplazarPedidoActivo } from "@/lib/pedidos";
import { nombreCompleto } from "@/lib/nombre";
import { conAdiciones, etiquetaCombo } from "@/lib/items";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useClaveSupervisor } from "@/components/ClaveSupervisor";
import { NuevoDomicilio } from "@/components/domicilios/NuevoDomicilio";
import { DomicilioEnCurso, type PedidoDomicilio } from "@/components/domicilios/DomicilioEnCurso";
import { PlataformasAdmin } from "@/components/domicilios/PlataformasAdmin";
import type { Cobro } from "@/components/RegistroPagos";
import type { Pedido, PedidoItem, Plataforma, Producto } from "@/lib/types";

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
  const showToast = useToastStore((state) => state.show);
  const { conAutorizacion, modal: modalClave } = useClaveSupervisor();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [domicilios, setDomicilios] = useState<PedidoDomicilio[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<string[]>([]);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const cargarPedidos = () => apiFetch<Pedido[]>("/pedidos/activos", { token }).then(setPedidos);
    const cargarDomicilios = () => apiFetch<PedidoDomicilio[]>("/domicilios/activos", { token }).then(setDomicilios);
    cargarPedidos();
    cargarDomicilios();
    apiFetch<Producto[]>("/productos", { token }).then((lista) => setProductos(lista.filter((p) => p.isActive)));
    apiFetch<Plataforma[]>("/plataformas", { token }).then(setPlataformas);
    apiFetch<string[]>("/domicilios/domiciliarios", { token }).then(setDomiciliarios);

    // Al reconectar (reinicio del servidor, wifi...) se recarga desde la API
    // en vez de quedarse con datos viejos en pantalla.
    const aplicar = (pedido: Pedido) => {
      setPedidos((prev) => reemplazarPedidoActivo(prev, pedido));
      if (pedido.canal === "DOMICILIO" || pedido.canal === "PLATAFORMA") cargarDomicilios();
    };
    return suscribirEnVivo(token, {
      connect: () => {
        cargarPedidos();
        cargarDomicilios();
      },
      "pedido:nuevo": aplicar,
      "pedido:actualizado": aplicar,
      "producto:actualizado": (p: Producto) => setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accion(pedido: PedidoDomicilio, hacer: () => Promise<PedidoDomicilio | null>, aviso: string) {
    setError(null);
    setOcupadoId(pedido.id);
    try {
      const actualizado = await hacer();
      if (!actualizado) return;
      const terminado = actualizado.domicilio ? actualizado.domicilio.estado === "ENTREGADO" || actualizado.domicilio.estado === "FALLIDO" : actualizado.estado === "ENTREGADO";
      setDomicilios((prev) => (terminado ? prev.filter((p) => p.id !== actualizado.id) : prev.map((p) => (p.id === actualizado.id ? actualizado : p))));
      showToast(aviso);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el pedido.");
    } finally {
      setOcupadoId(null);
    }
  }

  const despachar = (p: PedidoDomicilio, domiciliario: string) =>
    accion(
      p,
      () => apiFetch<PedidoDomicilio>(`/domicilios/${p.id}/despachar`, { method: "PUT", token, body: JSON.stringify({ domiciliario: domiciliario || null }) }),
      p.canal === "PLATAFORMA" ? "Entregado al repartidor" : "Domicilio en camino"
    ).then(() => {
      if (domiciliario && !domiciliarios.includes(domiciliario)) setDomiciliarios((prev) => [...prev, domiciliario]);
    });

  const entregado = (p: PedidoDomicilio, cobro: Cobro | null) =>
    accion(p, () => apiFetch<PedidoDomicilio>(`/domicilios/${p.id}/entregado`, { method: "PUT", token, body: JSON.stringify(cobro ? { cobro } : {}) }), "Domicilio entregado");

  const fallido = (p: PedidoDomicilio, motivo: string) =>
    accion(
      p,
      () =>
        conAutorizacion((pin) =>
          apiFetch<PedidoDomicilio>(`/domicilios/${p.id}/fallido`, { method: "PUT", token, body: JSON.stringify({ motivo, pin }) })
        ),
      "Registrado: no se pudo entregar"
    );

  const itemsParaLlevar: ItemParaLlevar[] = pedidos
    .filter((pedido) => pedido.canal === "MESA")
    .flatMap((pedido) =>
      pedido.items
        .filter((item) => item.paraLlevar && item.estado !== "CANCELADO" && item.estado !== "ENTREGADO")
        .map((item) => ({ ...item, pedido }))
    );

  if (!token) return null;

  return (
    <div className="space-y-8">
      {modalClave}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Domicilios y apps en curso</h2>
          <button onClick={() => setNuevoAbierto((v) => !v)} className="btn-primary rounded-full px-4 py-1.5 text-xs">
            {nuevoAbierto ? "Cerrar" : "+ Nuevo domicilio o pedido de app"}
          </button>
        </div>
        {nuevoAbierto ? (
          <NuevoDomicilio
            token={token}
            productos={productos}
            plataformas={plataformas}
            onCreado={() => {
              showToast("Pedido registrado y enviado a cocina");
              setNuevoAbierto(false);
              apiFetch<PedidoDomicilio[]>("/domicilios/activos", { token }).then(setDomicilios);
            }}
          />
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {domicilios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay domicilios ni pedidos de apps en curso.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {domicilios.map((p) => (
              <DomicilioEnCurso
                key={p.id}
                pedido={p}
                domiciliarios={domiciliarios}
                ocupado={ocupadoId === p.id}
                onDespachar={(d) => despachar(p, d)}
                onEntregado={(cobro) => entregado(p, cobro)}
                onFallido={(motivo) => fallido(p, motivo)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold">Para llevar (mesas abiertas)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Productos que un cliente pidió para llevar mientras sigue en su mesa (ej. algo para alguien que no vino).
        </p>

        {itemsParaLlevar.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No hay pedidos para llevar en este momento.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {itemsParaLlevar.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <div>
                  <p className="font-semibold">
                    {item.cantidad}× {conAdiciones(item, item.producto?.nombre)}
                    {item.comboNombre ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{etiquetaCombo(item)}</span> : null}
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

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Apps de domicilios</h2>
        <p className="text-sm text-muted-foreground">
          La comisión se descuenta de la ganancia en los reportes. Lo que venden las apps no entra a la caja: la app lo consigna.
        </p>
        <PlataformasAdmin token={token} plataformas={plataformas} onCambio={setPlataformas} />
      </section>
    </div>
  );
}
