"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { resolverImagenUrl } from "@/lib/images";
import type { CategoriaConCarta } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

interface CartItem {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas: string;
  paraLlevar: boolean;
}

function CartaContent() {
  const searchParams = useSearchParams();
  const mesaId = searchParams.get("mesa");
  const esRecoger = searchParams.get("recoger") === "1";
  const puedeOrdenar = Boolean(mesaId) || esRecoger;
  const [categorias, setCategorias] = useState<CategoriaConCarta[] | null>(null);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [nombreCliente, setNombreCliente] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CategoriaConCarta[]>("/carta").then(setCategorias);
  }, []);

  function agregarAlCarrito(producto: { id: string; nombre: string; precio: number }) {
    setEnviado(false);
    setCarrito((prev) => {
      const existente = prev.find((i) => i.productoId === producto.id);
      if (existente) {
        return prev.map((i) => (i.productoId === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        { productoId: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1, notas: "", paraLlevar: false },
      ];
    });
  }

  function cambiarCantidad(productoId: string, delta: number) {
    setCarrito((prev) =>
      prev.map((i) => (i.productoId === productoId ? { ...i, cantidad: i.cantidad + delta } : i)).filter((i) => i.cantidad > 0)
    );
  }

  function cambiarNotas(productoId: string, notas: string) {
    setCarrito((prev) => prev.map((i) => (i.productoId === productoId ? { ...i, notas } : i)));
  }

  function cambiarParaLlevar(productoId: string, paraLlevar: boolean) {
    setCarrito((prev) => prev.map((i) => (i.productoId === productoId ? { ...i, paraLlevar } : i)));
  }

  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  async function enviarPedido() {
    if (!puedeOrdenar || carrito.length === 0) return;
    if (esRecoger && (!nombreCliente.trim() || !telefonoCliente.trim())) {
      setError("Para un pedido de mostrador necesitamos tu nombre y tu teléfono, así te avisamos cuando esté listo.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await apiFetch("/solicitudes", {
        method: "POST",
        body: JSON.stringify({
          mesaId: mesaId ?? null,
          nombreCliente: nombreCliente.trim() || null,
          telefonoCliente: esRecoger ? telefonoCliente.trim() : null,
          items: carrito.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            notas: i.notas.trim() || null,
            paraLlevar: i.paraLlevar,
          })),
        }),
      });
      setEnviado(true);
      setCarrito([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar tu pedido. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="brand-gradient-text text-center text-3xl font-extrabold tracking-tight">Comidas Rápidas</h1>
      <p className="mt-2 text-center text-muted-foreground">Nuestra carta</p>

      {puedeOrdenar ? (
        enviado ? (
          <div className="mt-6 rounded-xl border border-accent bg-accent/5 p-4 text-center text-sm">
            <p className="font-semibold text-accent">
              {esRecoger ? "¡Listo! Tu pedido quedará esperando en caja." : "¡Listo! Tu pedido quedará esperando a tu mesero."}
            </p>
            <p className="mt-1 text-muted-foreground">
              {esRecoger
                ? "Te lo confirmarán en caja. Puedes ver en la pantalla del local cuando esté listo para recoger."
                : "Apenas llegue, lo confirmará y lo enviará a cocina."}
            </p>
            <button onClick={() => setEnviado(false)} className="mt-3 text-xs font-semibold text-accent">
              Hacer otro pedido
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
            {esRecoger
              ? "Arma tu pedido para recoger. Cuando termines, acércate a caja para confirmarlo y pagarlo."
              : "¿Ya sabes qué vas a pedir? Agrégalo aquí abajo y quedará listo para cuando llegue tu mesero."}
          </p>
        )
      ) : null}

      {!categorias ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : categorias.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Todavía no hay productos disponibles.</p>
      ) : (
        <div className="mt-8 space-y-8 pb-40">
          {categorias.map((categoria) => {
            const CategoriaIcon = getCategoryIcon(categoria.icono);
            return (
              <section key={categoria.id}>
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <CategoriaIcon size={18} className="text-accent" />
                  <h2 className="text-lg font-bold">{categoria.nombre}</h2>
                </div>
                <div className="mt-3 space-y-3">
                  {categoria.productos.map((producto) => {
                    const imagen = resolverImagenUrl(producto.imagenUrl);
                    return (
                      <div key={producto.id} className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {imagen ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imagen} alt={producto.nombre} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                          ) : null}
                          <div>
                            <p className="font-semibold">{producto.nombre}</p>
                            <p className="text-sm text-muted-foreground">{producto.descripcion}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-semibold">{formatCOP(producto.precio)}</p>
                          {puedeOrdenar ? (
                            <button
                              onClick={() => agregarAlCarrito(producto)}
                              className="rounded-full border border-accent px-2 py-1 text-xs font-semibold text-accent"
                            >
                              + Agregar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {puedeOrdenar && carrito.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-sm font-bold">Tu pedido</h2>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {carrito.map((item) => (
                <div key={item.productoId} className="space-y-1 border-b border-border pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span>{item.nombre}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => cambiarCantidad(item.productoId, -1)} className="text-muted-foreground">
                        <Minus size={14} />
                      </button>
                      <span className="w-5 text-center">{item.cantidad}</span>
                      <button onClick={() => cambiarCantidad(item.productoId, 1)} className="text-muted-foreground">
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <input
                    value={item.notas}
                    onChange={(e) => cambiarNotas(item.productoId, e.target.value)}
                    placeholder="Notas (ej. sin cebolla)"
                    className="w-full rounded-lg border border-border px-2 py-1 text-xs"
                  />
                  {!esRecoger ? (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={item.paraLlevar}
                        onChange={(e) => cambiarParaLlevar(item.productoId, e.target.checked)}
                      />
                      🥡 Es para llevar (para alguien que no está en la mesa)
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span>{formatCOP(total)}</span>
            </div>
            <input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder={esRecoger ? "Tu nombre" : "Tu nombre (opcional)"}
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            {esRecoger ? (
              <input
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(e.target.value)}
                placeholder="Tu teléfono (para avisarte)"
                className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            ) : null}
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            <button
              onClick={enviarPedido}
              disabled={enviando}
              className="btn-primary mt-3 w-full rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar mi pedido"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CartaPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">Cargando…</div>}>
      <CartaContent />
    </Suspense>
  );
}
