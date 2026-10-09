"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Flame, Minus, Plus, Tag } from "lucide-react";
import { Boton, cx, Entrada, Esqueleto, Insignia, PuntoVivo } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { resolverImagenUrl } from "@/lib/images";
import { unlockAudio } from "@/lib/notificationSound";
import { formatoPesos } from "@/lib/formato";
import { LlamarMesero } from "@/components/LlamarMesero";
import { precioConAdiciones } from "@/lib/items";
import type { CategoriaConCarta, Producto, SolicitudPedido } from "@/lib/types";

// Último pedido enviado desde este celular, para poder volver a su página de
// seguimiento si el cliente cerró la pestaña. Solo en este dispositivo.
const CLAVE_PEDIDO_RECIENTE = "comidas-pedido-reciente";
const VIGENCIA_PEDIDO_RECIENTE_MS = 6 * 60 * 60_000;

function leerPedidoReciente(): string | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_PEDIDO_RECIENTE) ?? "null") as { codigo: string; en: number } | null;
    return guardado && Date.now() - guardado.en < VIGENCIA_PEDIDO_RECIENTE_MS ? guardado.codigo : null;
  } catch {
    return null;
  }
}

function guardarPedidoReciente(codigo: string) {
  try {
    localStorage.setItem(CLAVE_PEDIDO_RECIENTE, JSON.stringify({ codigo, en: Date.now() }));
  } catch {
    // Sin almacenamiento (modo privado, etc.): igual se redirige al seguimiento.
  }
}

// Una línea por producto + combinación de adiciones: la misma hamburguesa
// con y sin queso extra son dos líneas distintas.
interface CartItem {
  clave: string;
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas: string;
  paraLlevar: boolean;
  adicionIds: string[];
}

function CartaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mesaId = searchParams.get("mesa");
  const esRecoger = searchParams.get("recoger") === "1";
  // El QR de mostrador de cada sede lleva su sede (el de una mesa ya la tiene).
  const sedeId = searchParams.get("sede");
  const [sedeNombre, setSedeNombre] = useState<string | null>(null);
  const puedeOrdenar = Boolean(mesaId) || esRecoger;
  const [categorias, setCategorias] = useState<CategoriaConCarta[] | null>(null);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  // Adiciones marcadas en cada producto antes de tocar "Agregar".
  const [adicionesElegidas, setAdicionesElegidas] = useState<Record<string, string[]>>({});
  const [nombreCliente, setNombreCliente] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [aceptaDatos, setAceptaDatos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedidoReciente, setPedidoReciente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const filtro = new URLSearchParams();
    if (mesaId) filtro.set("mesa", mesaId);
    if (sedeId) filtro.set("sede", sedeId);
    apiFetch<CategoriaConCarta[]>(`/carta${filtro.size ? `?${filtro}` : ""}`).then(setCategorias);
    setPedidoReciente(leerPedidoReciente());
    if (sedeId)
      apiFetch<{ nombre: string }>(`/sedes/publica/${encodeURIComponent(sedeId)}`)
        .then((s) => setSedeNombre(s.nombre))
        .catch(() => setSedeNombre(null));
  }, [mesaId, sedeId]);

  function alternarAdicion(productoId: string, adicionId: string) {
    setAdicionesElegidas((prev) => {
      const actuales = prev[productoId] ?? [];
      return { ...prev, [productoId]: actuales.includes(adicionId) ? actuales.filter((x) => x !== adicionId) : [...actuales, adicionId] };
    });
  }

  function agregarAlCarrito(producto: Producto) {
    const adicionIds = [...(adicionesElegidas[producto.id] ?? [])].sort();
    const elegidas = (producto.adiciones ?? []).filter((a) => adicionIds.includes(a.id));
    const clave = [producto.id, ...adicionIds].join("|");
    setCarrito((prev) => {
      if (prev.some((i) => i.clave === clave)) {
        return prev.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          clave,
          productoId: producto.id,
          nombre: elegidas.length > 0 ? `${producto.nombre} + ${elegidas.map((a) => a.nombre).join(", ")}` : producto.nombre,
          precio: precioConAdiciones(producto, adicionIds),
          cantidad: 1,
          notas: "",
          paraLlevar: false,
          adicionIds,
        },
      ];
    });
    setAdicionesElegidas((prev) => ({ ...prev, [producto.id]: [] }));
  }

  function cambiarCantidad(clave: string, delta: number) {
    setCarrito((prev) => prev.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + delta } : i)).filter((i) => i.cantidad > 0));
  }

  function cambiarNotas(clave: string, notas: string) {
    setCarrito((prev) => prev.map((i) => (i.clave === clave ? { ...i, notas } : i)));
  }

  function cambiarParaLlevar(clave: string, paraLlevar: boolean) {
    setCarrito((prev) => prev.map((i) => (i.clave === clave ? { ...i, paraLlevar } : i)));
  }

  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  async function enviarPedido() {
    if (!puedeOrdenar || carrito.length === 0) return;
    if (esRecoger && (!nombreCliente.trim() || !telefonoCliente.trim())) {
      setError("Para un pedido de mostrador necesitamos tu nombre y tu teléfono, así te avisamos cuando esté listo.");
      return;
    }
    if (esRecoger && !aceptaDatos) {
      setError("Para continuar, autoriza el uso de tu nombre y teléfono para este pedido.");
      return;
    }
    // Este toque del cliente habilita el sonido de "listo" en la página de
    // seguimiento (los navegadores bloquean el audio sin un gesto previo).
    unlockAudio();
    setError(null);
    setEnviando(true);
    try {
      const solicitud = await apiFetch<SolicitudPedido>("/solicitudes", {
        method: "POST",
        body: JSON.stringify({
          mesaId: mesaId ?? null,
          sedeId: mesaId ? undefined : (sedeId ?? undefined),
          nombreCliente: nombreCliente.trim() || null,
          telefonoCliente: esRecoger ? telefonoCliente.trim() : null,
          aceptaDatos: esRecoger ? aceptaDatos : undefined,
          items: carrito.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            notas: i.notas.trim() || null,
            paraLlevar: i.paraLlevar,
            adicionIds: i.adicionIds,
          })),
        }),
      });
      setCarrito([]);
      if (solicitud.codigoSeguimiento) {
        guardarPedidoReciente(solicitud.codigoSeguimiento);
        router.push(`/seguimiento/${solicitud.codigoSeguimiento}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar tu pedido. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-10 sm:px-6 sm:pt-12">
      <header className="animate-aparecer text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-acento">
          <Flame className="size-7" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="brand-gradient-text">Comidas Rápidas</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Nuestra carta{sedeNombre ? ` · ${sedeNombre}` : ""}</p>
      </header>

      <div className="mx-auto mt-6 grid max-w-2xl gap-3">
        {mesaId ? <LlamarMesero mesaId={mesaId} /> : null}

        {puedeOrdenar && pedidoReciente ? (
          <Link
            href={`/seguimiento/${pedidoReciente}`}
            className="group flex items-center justify-between gap-3 rounded-2xl bg-accent/10 px-4 py-3.5 text-sm font-semibold text-accent ring-1 ring-accent/25 transition-colors ring-inset hover:bg-accent/15"
          >
            <span className="flex items-center gap-2">
              <PuntoVivo tono="acento" /> Tienes un pedido en curso → ver cómo va
            </span>
            <ArrowRight className="size-4 transition-transform duration-200 ease-resorte group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : null}

        {puedeOrdenar ? (
          <p className="rounded-2xl bg-surface-2/80 px-4 py-3.5 text-center text-sm leading-relaxed text-muted-foreground ring-1 ring-border ring-inset">
            {esRecoger
              ? `Arma tu pedido para recoger${sedeNombre ? ` en ${sedeNombre}` : ""}. Cuando termines, acércate a caja para confirmarlo y pagarlo.`
              : "¿Ya sabes qué vas a pedir? Agrégalo aquí abajo y quedará listo para cuando llegue tu mesero."}
          </p>
        ) : null}
      </div>

      {!categorias ? (
        <div className="mx-auto mt-10 grid max-w-2xl gap-3" aria-label="Cargando…">
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : categorias.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Todavía no hay productos disponibles.</p>
      ) : (
        <>
          {/* Atajos a cada categoría: quedan fijos bajo la barra al bajar por la carta. */}
          <nav
            aria-label="Categorías"
            className="sticky top-16 z-20 -mx-4 mt-8 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6"
          >
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categorias.map((categoria) => {
                const Icono = getCategoryIcon(categoria.icono);
                return (
                  <a
                    key={categoria.id}
                    href={`#categoria-${categoria.id}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-suave ring-1 ring-border transition-colors ring-inset hover:text-foreground"
                  >
                    <Icono className="size-4 text-accent" aria-hidden />
                    {categoria.nombre}
                  </a>
                );
              })}
            </div>
          </nav>

          <div className={cx("mt-6 grid gap-10", puedeOrdenar && carrito.length > 0 ? "pb-[26rem] sm:pb-80" : "pb-10")}>
            {categorias.map((categoria) => {
              const CategoriaIcon = getCategoryIcon(categoria.icono);
              return (
                <section key={categoria.id} id={`categoria-${categoria.id}`} className="scroll-mt-32">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
                      <CategoriaIcon className="size-[18px]" aria-hidden />
                    </span>
                    <h2 className="text-xl font-semibold tracking-tight">{categoria.nombre}</h2>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {categoria.productos.map((producto) => {
                      const imagen = resolverImagenUrl(producto.imagenUrl);
                      const elegidas = adicionesElegidas[producto.id] ?? [];
                      return (
                        <article key={producto.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-suave">
                          <div className="flex items-start gap-3.5">
                            {imagen ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imagen} alt={producto.nombre} className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-border" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-semibold leading-snug">{producto.nombre}</p>
                                <div className="shrink-0 text-right">
                                  {producto.promocion ? (
                                    <p className="text-xs text-muted-foreground line-through tabular-nums">{formatoPesos(producto.precio)}</p>
                                  ) : null}
                                  <p className="font-semibold tabular-nums">{formatoPesos(producto.promocion?.precio ?? producto.precio)}</p>
                                </div>
                              </div>
                              {producto.promocion ? (
                                <Insignia tono="exito" className="mt-1">
                                  <Tag aria-hidden /> {producto.promocion.nombre}: −{producto.promocion.descuentoPct}%
                                </Insignia>
                              ) : null}
                              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{producto.descripcion}</p>
                              {producto.esCombo && producto.componentes?.length ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Incluye: {producto.componentes.map((c) => `${c.cantidad > 1 ? `${c.cantidad}× ` : ""}${c.producto.nombre}`).join(" + ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {(producto.adiciones?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {producto.adiciones!.map((a) =>
                                puedeOrdenar ? (
                                  <button
                                    key={a.id}
                                    type="button"
                                    aria-pressed={elegidas.includes(a.id)}
                                    onClick={() => alternarAdicion(producto.id, a.id)}
                                    className={cx(
                                      "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-all duration-200 ease-resorte active:scale-95",
                                      elegidas.includes(a.id)
                                        ? "bg-accent text-accent-foreground ring-accent"
                                        : "bg-surface text-muted-foreground ring-border hover:text-foreground",
                                    )}
                                  >
                                    {a.nombre}
                                    {a.precio > 0 ? ` +${formatoPesos(a.precio)}` : ""}
                                  </button>
                                ) : (
                                  <span key={a.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
                                    {a.nombre}
                                    {a.precio > 0 ? ` +${formatoPesos(a.precio)}` : ""}
                                  </span>
                                ),
                              )}
                            </div>
                          ) : null}
                          {puedeOrdenar ? (
                            <Boton variante="secundario" tamano="sm" className="mt-auto self-end text-accent" onClick={() => agregarAlCarrito(producto)}>
                              <Plus /> Agregar
                            </Boton>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {puedeOrdenar && carrito.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 animate-aparecer px-2 pb-2 sm:px-4 sm:pb-4">
          <div className="mx-auto max-w-2xl rounded-3xl border border-border/70 bg-surface/90 p-4 shadow-flotante backdrop-blur-xl backdrop-saturate-150 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Tu pedido</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {carrito.reduce((s, i) => s + i.cantidad, 0)} producto{carrito.reduce((s, i) => s + i.cantidad, 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3 max-h-40 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
              {carrito.map((item) => (
                <div key={item.clave} className="space-y-1.5 border-b border-border/70 pb-2.5 text-sm last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      {item.nombre} <span className="text-xs text-muted-foreground tabular-nums">{formatoPesos(item.precio)}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 p-0.5 ring-1 ring-border ring-inset">
                      <button
                        onClick={() => cambiarCantidad(item.clave, -1)}
                        aria-label={`Quitar uno de ${item.nombre}`}
                        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums">{item.cantidad}</span>
                      <button
                        onClick={() => cambiarCantidad(item.clave, 1)}
                        aria-label={`Agregar uno de ${item.nombre}`}
                        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <Entrada
                    tamano="sm"
                    value={item.notas}
                    onChange={(e) => cambiarNotas(item.clave, e.target.value)}
                    placeholder="Notas (ej. sin cebolla)"
                    aria-label={`Notas para ${item.nombre}`}
                  />
                  {!esRecoger ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={item.paraLlevar}
                        onChange={(e) => cambiarParaLlevar(item.clave, e.target.checked)}
                        className="size-4 accent-accent"
                      />
                      Es para llevar (para alguien que no está en la mesa)
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border/70 pt-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatoPesos(total)}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Entrada
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder={esRecoger ? "Tu nombre" : "Tu nombre (opcional)"}
                aria-label="Tu nombre"
                className={esRecoger ? "" : "sm:col-span-2"}
              />
              {esRecoger ? (
                <Entrada
                  value={telefonoCliente}
                  onChange={(e) => setTelefonoCliente(e.target.value)}
                  placeholder="Tu teléfono (para avisarte)"
                  inputMode="tel"
                  aria-label="Tu teléfono"
                />
              ) : null}
            </div>
            {esRecoger ? (
              <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-muted-foreground">
                <input type="checkbox" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
                <span>
                  Autorizo el uso de mi nombre y teléfono solo para gestionar este pedido y avisarme cuando esté listo. El teléfono se borra a los 30 días (Ley 1581 de
                  2012).
                </span>
              </label>
            ) : null}
            {error ? <p className="mt-2.5 text-xs font-medium text-peligro">{error}</p> : null}
            <Boton bloque tamano="lg" className="mt-3" onClick={enviarPedido} cargando={enviando}>
              {enviando ? "Enviando…" : "Enviar mi pedido"}
            </Boton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CartaPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid max-w-2xl gap-3 px-4 py-16 sm:px-6" aria-label="Cargando…">
          <Esqueleto className="mx-auto size-14 rounded-2xl" />
          <Esqueleto className="mx-auto h-8 w-56" />
          <Esqueleto className="mt-6 h-24 rounded-2xl" />
          <Esqueleto className="h-24 rounded-2xl" />
        </div>
      }
    >
      <CartaContent />
    </Suspense>
  );
}
