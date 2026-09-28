export type UserRole = "ADMIN" | "MESERO" | "COCINA" | "PANTALLA";

// Referencia liviana a una persona (mesero, quien resolvió algo, etc.) — el
// nombre completo se arma con nombreCompleto() de "@/lib/nombre".
export interface PersonaBasica {
  id: string;
  nombre: string;
  apellido: string;
}

export interface AuthUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  role: UserRole;
}

export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  icono: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  tiempoPreparacionMinutos: number;
  categoriaId: string;
  categoria?: Categoria;
  imagenUrl: string | null;
  // false = no pasa por cocina (bebidas, empacados): nace listo para llevar.
  requiereCocina: boolean;
  // Costo por unidad; solo llega al admin (null = sin configurar).
  costo?: number | null;
  disponible: boolean;
  isActive: boolean;
}

export type MesaEstado = "LIBRE" | "OCUPADA";

export interface Mesa {
  id: string;
  numero: string;
  capacidad: number;
  estado: MesaEstado;
  meseroAsignadoId: string | null;
  meseroAsignado?: PersonaBasica | null;
  // Una mesa con historial no se borra, se desactiva (deja de verse en la
  // grilla del mesero y en el QR, pero sus cuentas viejas siguen intactas).
  activa: boolean;
  // Solo viene en el evento en vivo cuando la mesa se borró del todo.
  eliminada?: boolean;
}

export type MesaSesionEstado = "ABIERTA" | "CUENTA_SOLICITADA" | "CERRADA";

export interface Comensal {
  id: string;
  mesaSesionId: string;
  nombre: string;
}

export interface MesaSesion {
  id: string;
  mesaId: string;
  mesa?: Mesa;
  meseroId: string;
  mesero?: PersonaBasica;
  nombreResponsable: string;
  sillasAdicionales: number;
  estado: MesaSesionEstado;
  abiertaEn: string;
  cerradaEn: string | null;
  comensales?: Comensal[];
  pedidos?: Pedido[];
  factura?: Factura | null;
}

export type PedidoEstado = "RECIBIDO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO";

export interface PedidoItem {
  id: string;
  pedidoId: string;
  comensalId: string | null;
  comensal?: Comensal | null;
  paraLlevar: boolean;
  productoId: string;
  producto?: Producto;
  cantidad: number;
  notas: string | null;
  precioUnitario: number;
  tiempoPreparacionMinutos: number;
  estado: PedidoEstado;
  iniciadoEn: string | null;
  listoEn: string | null;
}

export interface PedidoStatusLog {
  id: string;
  pedidoId: string;
  deEstado: PedidoEstado | null;
  aEstado: PedidoEstado;
  cambiadoEn: string;
  cambiadoPor: PersonaBasica & { role: UserRole };
}

export interface Pedido {
  id: string;
  // Un pedido normal tiene mesaSesionId; un pedido de mostrador (sin mesa,
  // "para recoger") lo deja en null y usa nombreCliente/telefonoCliente.
  mesaSesionId: string | null;
  mesaSesion?: MesaSesion | null;
  nombreCliente: string | null;
  telefonoCliente: string | null;
  meseroId: string;
  mesero?: PersonaBasica;
  estado: PedidoEstado;
  notasGenerales: string | null;
  // true si nació de una SolicitudPedido que el cliente armó desde el QR
  // (de su mesa, o del mostrador) — quien lo confirmó solo la validó.
  origenCliente: boolean;
  creadoEn: string;
  iniciadoEn: string | null;
  listoEn: string | null;
  entregadoEn: string | null;
  items: PedidoItem[];
  statusLogs?: PedidoStatusLog[];
}

export type FacturaEstado = "PENDIENTE" | "PAGADA" | "PERDIDA";
export type MetodoPago = "EFECTIVO" | "TARJETA" | "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA" | "OTRO";

export interface Pago {
  metodo: MetodoPago;
  monto: number;
}

export interface Factura {
  id: string;
  mesaSesionId: string | null;
  pedidoId: string | null;
  subtotal: number;
  propinaMonto: number;
  total: number;
  estado: FacturaEstado;
  metodoPago: MetodoPago | null;
  generadaEn: string;
  pagadaEn: string | null;
}

export interface ReporteItemFila {
  pedidoItemId: string;
  mesaNumero: string;
  meseroNombre: string;
  productoNombre: string;
  creadoEn: string;
  tiempoEstimadoMinutos: number;
  tiempoRealMinutos: number;
  diferenciaMinutos: number;
}

export interface ReporteProductoFila {
  productoId: string;
  nombre: string;
  tiempoConfiguradoMinutos: number;
  promedioRealMinutos: number;
  muestras: number;
}

export interface ReporteTiempos {
  resumen: {
    totalItems: number;
    promedioEstimadoMinutos: number;
    promedioRealMinutos: number;
    itemsSobreEstimado: number;
  };
  items: ReporteItemFila[];
  porProducto: ReporteProductoFila[];
}

export interface CuentaReporte {
  id: string;
  fecha: string;
  dia: string;
  canal: "MESA" | "MOSTRADOR";
  ubicacion: string;
  atendidoPor: string;
  estado: "PAGADA" | "PERDIDA";
  // null si se pagó con varios métodos (ver pagos).
  metodoPago: MetodoPago | null;
  pagos: Pago[];
  subtotal: number;
  propina: number;
  total: number;
}

export type ClasificacionMenu = "ESTRELLA" | "CABALLO" | "ROMPECABEZAS" | "PERRO";

export interface ProductoReporte {
  productoId: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  ventas: number;
  unidadesConCosto: number;
  ventasConCosto: number;
  costo: number;
  ganancia: number | null;
  margenPct: number | null;
  clasificacion: ClasificacionMenu | null;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  resumen: {
    ventas: number;
    cuentas: number;
    ticketPromedio: number;
    propinas: number;
    perdidas: { cuentas: number; total: number };
    cancelaciones: { productos: number; total: number; merma: number; costoMerma: number };
    ganancia: {
      ventasConCosto: number;
      costoVentas: number;
      gananciaBruta: number;
      margenPct: number | null;
      productosSinCosto: string[];
    };
  };
  porDia: { dia: string; ventas: number; cuentas: number }[];
  porMetodo: { metodo: MetodoPago; ventas: number; cuentas: number }[];
  porCanal: Record<"MESA" | "MOSTRADOR", { ventas: number; cuentas: number }>;
  porMesero: { meseroId: string; nombre: string; ventas: number; cuentas: number; propinas: number }[];
  porProducto: ProductoReporte[];
  perdidas: CuentaReporte[];
  cancelaciones: {
    id: string;
    fecha: string;
    producto: string;
    cantidad: number;
    valor: number;
    ubicacion: string;
    canceladoPor: string;
    yaEnCocina: boolean;
  }[];
  cuentas: CuentaReporte[];
}

export interface TotalesCaja {
  desde: string;
  cuentasPagadas: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalNequi: number;
  totalDaviplata: number;
  totalTransferencia: number;
  totalOtro: number;
  propinas: number;
  cuentasPerdidas: number;
  totalPerdidas: number;
  totalEntradas: number;
  totalSalidas: number;
}

export type TipoMovimientoCaja = "ENTRADA" | "SALIDA" | "ENTREGA_MESERO";

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  mesero: PersonaBasica | null;
  registradoPor: PersonaBasica;
  creadoEn: string;
}

export interface CuadreMesero {
  userId: string;
  nombre: string;
  cobrado: number;
  entregado: number;
  pendiente: number;
}

export interface CajaActual extends TotalesCaja {
  movimientos: MovimientoCaja[];
  porMesero: CuadreMesero[];
  mesasAbiertas: number;
  cuentasPorCobrar: number;
}

export interface CierreCaja extends TotalesCaja {
  id: string;
  hasta: string;
  cerradoPor: PersonaBasica;
  baseInicial: number;
  efectivoContado: number;
  diferencia: number;
  notas: string | null;
}

export interface CategoriaConCarta extends Categoria {
  productos: Producto[];
}

export type SolicitudPedidoEstado = "PENDIENTE" | "CONFIRMADA" | "DESCARTADA";

export interface SolicitudPedidoItem {
  id: string;
  productoId: string;
  producto?: Producto;
  cantidad: number;
  notas: string | null;
  paraLlevar: boolean;
}

export interface SolicitudPedido {
  id: string;
  mesaId: string | null;
  mesa?: { id: string; numero: string } | null;
  nombreCliente: string | null;
  telefonoCliente: string | null;
  estado: SolicitudPedidoEstado;
  items: SolicitudPedidoItem[];
  creadaEn: string;
  resueltaEn: string | null;
  resueltaPor?: PersonaBasica | null;
  pedidoId: string | null;
  codigoSeguimiento: string | null;
}

export type NotificacionTipo =
  | "PEDIDO_NUEVO"
  | "ITEM_RETRASADO"
  | "ITEM_LISTO"
  | "SOLICITUD_PEDIDO_CLIENTE"
  | "ITEM_CANCELADO";

export interface Notificacion {
  id: string;
  userId: string;
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId: string | null;
  pedidoItemId: string | null;
  // Pantalla a la que lleva al hacer clic (null en notificaciones viejas).
  enlace: string | null;
  leida: boolean;
  creadaEn: string;
}
