"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { suscribirEnVivo } from "@/lib/socket";
import { nombreCompleto } from "@/lib/nombre";
import { useResaltado } from "@/lib/resaltado";
import { useClaveSupervisor } from "@/components/ClaveSupervisor";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { SolicitudesCliente } from "@/components/mesa/SolicitudesCliente";
import { NuevoPedido, type ItemBorrador } from "@/components/mesa/NuevoPedido";
import { ListaPedidos } from "@/components/mesa/ListaPedidos";
import { GestionMesa } from "@/components/mesa/GestionMesa";
import { CuentaMesa, type DescuentoCuenta } from "@/components/mesa/CuentaMesa";
import type { Cobro } from "@/components/RegistroPagos";
import { paraEnviar, type ClienteDeCuenta } from "@/lib/clientes";
import type { Factura, MesaSesion, MetodoPago, Pedido, PedidoItem, Producto, SolicitudPedido } from "@/lib/types";

export default function MesaSesionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.show);
  const [sesion, setSesion] = useState<MesaSesion | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudPedido[]>([]);
  const [resolviendoSolicitudId, setResolviendoSolicitudId] = useState<string | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<string | null>(null);
  const [actualizandoItemId, setActualizandoItemId] = useState<string | null>(null);
  const [generandoCuenta, setGenerandoCuenta] = useState(false);
  const [pagando, setPagando] = useState(false);
  // Al llegar desde "producto listo para entregar": ese producto se resalta.
  const [resaltado, lectorResaltado] = useResaltado(["item"]);
  const { conAutorizacion, modal: modalClave } = useClaveSupervisor();

  async function cargarSesion() {
    if (!token) return;
    setSesion(await apiFetch<MesaSesion>(`/mesa-sesiones/${id}`, { token }));
  }

  async function cargarSolicitudes() {
    if (!token) return;
    setSolicitudes(await apiFetch<SolicitudPedido[]>("/solicitudes?estado=PENDIENTE", { token }));
  }

  async function cargarProductos() {
    if (!token) return;
    setProductos(await apiFetch<Producto[]>("/productos", { token }));
  }

  // Aplica un pedido que cambió (respuesta de la API o evento en vivo).
  function aplicarPedido(pedido: Pedido) {
    setSesion((prev) => {
      if (!prev || pedido.mesaSesionId !== prev.id) return prev;
      const otros = (prev.pedidos ?? []).filter((p) => p.id !== pedido.id);
      return { ...prev, pedidos: [...otros, pedido].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)) };
    });
  }

  useEffect(() => {
    if (!token) return;
    cargarSesion();
    cargarSolicitudes();
    cargarProductos();

    // Al reconectar (reinicio del servidor, wifi...) se recarga todo desde la
    // API en vez de quedarse con datos viejos en pantalla.
    return suscribirEnVivo(token, {
      connect: () => {
        cargarSesion();
        cargarSolicitudes();
        cargarProductos();
      },
      "pedido:nuevo": aplicarPedido,
      "pedido:actualizado": aplicarPedido,
      // Comensal nuevo, cambio de mesa o reasignación hecha desde otro equipo.
      "mesaSesion:nueva": (actualizada: MesaSesion) => {
        if (actualizada.id === id) setSesion(actualizada);
      },
      "producto:actualizado": (producto: Producto) => {
        setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, ...producto } : p)));
      },
      "solicitud:nueva": (s: SolicitudPedido) => setSolicitudes((prev) => [...prev.filter((x) => x.id !== s.id), s]),
      "solicitud:actualizada": (s: SolicitudPedido) => setSolicitudes((prev) => prev.filter((x) => x.id !== s.id)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  // Envuelve una acción: muestra el error de la API si falla.
  async function intentar(accion: () => Promise<void>, mensajeError: string) {
    setError(null);
    try {
      await accion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : mensajeError);
    }
  }

  async function cambiarEstadoItem(pedido: Pedido, item: PedidoItem, estado: "ENTREGADO" | "CANCELADO") {
    if (!token) return;
    if (estado === "CANCELADO") {
      const nombre = item.producto?.nombre ?? "este producto";
      const pregunta =
        item.estado === "RECIBIDO"
          ? `¿Cancelar ${nombre}?`
          : `${nombre} ya está ${item.estado === "EN_PREPARACION" ? "en preparación" : "listo"}. ¿Seguro que quieres cancelarlo?`;
      if (!confirm(pregunta)) return;
    }
    setActualizandoItemId(item.id);
    await intentar(async () => {
      // Cancelar algo que cocina ya empezó pide la clave de un admin.
      const actualizado = await conAutorizacion((pin) =>
        apiFetch<Pedido>(`/pedidos/${pedido.id}/items/${item.id}/estado`, { method: "PUT", token, body: JSON.stringify({ estado, pin }) })
      );
      if (!actualizado) return;
      // Se aplica la respuesta de una vez (sin esperar el evento en vivo) para
      // que el botón no quede mostrando el estado viejo y evitar dobles clics.
      aplicarPedido(actualizado);
      if (estado === "CANCELADO") showToast("Producto cancelado");
    }, "No se pudo actualizar el producto.");
    setActualizandoItemId(null);
  }

  async function cambiarEstadoPedido(pedido: Pedido, estado: "ENTREGADO" | "CANCELADO") {
    if (!token) return;
    if (estado === "CANCELADO" && !confirm("¿Cancelar lo que falta de este pedido? Lo que ya se entregó se sigue cobrando.")) return;
    setActualizandoPedidoId(pedido.id);
    await intentar(async () => {
      const actualizado = await conAutorizacion((pin) =>
        apiFetch<Pedido>(`/pedidos/${pedido.id}/estado`, { method: "PUT", token, body: JSON.stringify({ estado, pin }) })
      );
      if (!actualizado) return;
      aplicarPedido(actualizado);
      showToast(estado === "ENTREGADO" ? "Pedido entregado" : "Pedido cancelado");
    }, "No se pudo actualizar el pedido.");
    setActualizandoPedidoId(null);
  }

  async function enviarPedido(items: ItemBorrador[]): Promise<boolean> {
    if (!token || items.length === 0) return false;
    setEnviando(true);
    let ok = false;
    await intentar(async () => {
      const pedido = await apiFetch<Pedido>("/pedidos", {
        method: "POST",
        token,
        body: JSON.stringify({
          mesaSesionId: id,
          items: items.map((i) => ({
            productoId: i.productoId,
            comensalId: i.comensalId,
            paraLlevar: i.paraLlevar,
            cantidad: i.cantidad,
            notas: i.notas || null,
            adicionIds: i.adicionIds,
          })),
        }),
      });
      aplicarPedido(pedido);
      showToast(pedido.items.some((i) => i.estado === "RECIBIDO") ? "Pedido enviado a cocina" : "Pedido registrado: ya puedes llevarlo");
      ok = true;
    }, "No se pudo enviar el pedido.");
    setEnviando(false);
    return ok;
  }

  async function resolverSolicitud(solicitud: SolicitudPedido, accion: "confirmar" | "descartar") {
    if (!token) return;
    setResolviendoSolicitudId(solicitud.id);
    await intentar(async () => {
      await apiFetch(`/solicitudes/${solicitud.id}/${accion}`, { method: "PUT", token });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitud.id));
      showToast(accion === "confirmar" ? "Pedido del cliente confirmado" : "Solicitud descartada");
      if (accion === "confirmar") await cargarSesion();
    }, `No se pudo ${accion} el pedido del cliente.`);
    setResolviendoSolicitudId(null);
  }

  async function generarCuenta(propina: number, descuento: DescuentoCuenta | null, cliente: ClienteDeCuenta | null) {
    if (!token) return;
    setGenerandoCuenta(true);
    await intentar(async () => {
      // Con descuento o cortesía, el servidor pide la clave de un admin.
      const factura = await conAutorizacion((pin) =>
        apiFetch<Factura>("/facturas", {
          method: "POST",
          token,
          body: JSON.stringify({ mesaSesionId: id, propinaMonto: propina, ...(descuento ? { descuento, pin } : {}), ...(cliente ? { cliente: paraEnviar(cliente) } : {}) }),
        })
      );
      if (!factura) return;
      await cargarSesion();
    }, "No se pudo generar la cuenta.");
    setGenerandoCuenta(false);
  }

  async function cerrarCuenta(resultado: Cobro | "perdida") {
    if (!token || !sesion?.factura) return;
    if (resultado === "perdida" && !confirm("¿Confirmas que el cliente se fue sin pagar? Esto cierra la mesa y deja registrada la pérdida.")) return;
    setPagando(true);
    await intentar(async () => {
      if (resultado === "perdida") {
        // Necesita la clave de un admin (si no, se podría cobrar en efectivo y
        // registrarlo como pérdida).
        const hecho = await conAutorizacion((pin) =>
          apiFetch(`/facturas/${sesion.factura!.id}/marcar-perdida`, { method: "PUT", token, body: JSON.stringify({ pin }) })
        );
        if (!hecho) return;
        showToast("Cuenta registrada como pérdida, mesa liberada");
      } else {
        await apiFetch(`/facturas/${sesion.factura!.id}/pagar`, { method: "PUT", token, body: JSON.stringify(resultado) });
        showToast("Cuenta pagada, mesa liberada");
      }
      router.push("/mesero");
    }, "No se pudo cerrar la cuenta.");
    setPagando(false);
  }

  if (!sesion) return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">Cargando…</div>;

  const esPropietario = sesion.meseroId === user?.id || user?.role === "ADMIN";
  const pedidos = sesion.pedidos ?? [];
  const comensales = sesion.comensales ?? [];
  const productosSinEntregar = pedidos.flatMap((p) => p.items).filter((i) => i.estado !== "ENTREGADO" && i.estado !== "CANCELADO").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {modalClave}
      <h1 className="text-2xl font-bold">
        Mesa {sesion.mesa?.numero} — {sesion.nombreResponsable}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Comensales: {comensales.map((c) => c.nombre).join(", ")}
        {sesion.sillasAdicionales > 0 ? ` · +${sesion.sillasAdicionales} silla(s) extra` : ""}
      </p>

      {!esPropietario ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Esta mesa la está atendiendo <strong>{nombreCompleto(sesion.mesero)}</strong>. Solo puedes verla, no gestionarla.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {esPropietario ? (
        <SolicitudesCliente
          solicitudes={solicitudes.filter((s) => s.mesaId === sesion.mesaId)}
          resolviendoId={resolviendoSolicitudId}
          onConfirmar={(s) => resolverSolicitud(s, "confirmar")}
          onDescartar={(s) => resolverSolicitud(s, "descartar")}
        />
      ) : null}

      {esPropietario && sesion.estado === "ABIERTA" ? (
        <NuevoPedido productos={productos} comensales={comensales} enviando={enviando} onEnviar={enviarPedido} />
      ) : null}

      {lectorResaltado}
      <ListaPedidos
        resaltarItemId={resaltado.item}
        pedidos={pedidos}
        comensales={comensales}
        esPropietario={esPropietario}
        nombreMesero={nombreCompleto(sesion.mesero)}
        actualizandoItemId={actualizandoItemId}
        actualizandoPedidoId={actualizandoPedidoId}
        onEntregarItem={(p, i) => cambiarEstadoItem(p, i, "ENTREGADO")}
        onCancelarItem={(p, i) => cambiarEstadoItem(p, i, "CANCELADO")}
        onEntregarPedido={(p) => cambiarEstadoPedido(p, "ENTREGADO")}
        onCancelarPedido={(p) => cambiarEstadoPedido(p, "CANCELADO")}
      />

      {esPropietario && sesion.estado === "ABIERTA" && token && user ? (
        <GestionMesa
          sesion={sesion}
          token={token}
          usuarioId={user.id}
          esAdmin={user.role === "ADMIN"}
          onActualizada={(actualizada, aviso) => {
            setSesion(actualizada);
            showToast(aviso);
          }}
        />
      ) : null}

      {esPropietario ? (
        <CuentaMesa
          sesion={sesion}
          productosSinEntregar={productosSinEntregar}
          generando={generandoCuenta}
          pagando={pagando}
          onGenerar={generarCuenta}
          onPagar={(cobro) => cerrarCuenta(cobro)}
          onPerdida={() => cerrarCuenta("perdida")}
        />
      ) : null}
    </div>
  );
}
