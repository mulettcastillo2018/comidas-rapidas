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
  // null = administrador general (elige la sede en la barra).
  sede?: { id: string; nombre: string } | null;
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
  // Inventario por unidades (bebidas, empacados); no llega a la carta pública.
  controlaStock?: boolean;
  stock?: number;
  stockMinimo?: number;
  // Adiciones que se le pueden poner (extra queso, sin cebolla...).
  adiciones?: AdicionBasica[];
  // Un combo: producto hecho de otros productos, con precio propio.
  esCombo?: boolean;
  componentes?: { productoId: string; cantidad: number; producto: { id: string; nombre: string } }[];
  // Promoción que aplica en este momento (precio ya con descuento).
  promocion?: { nombre: string; descuentoPct: number; precio: number } | null;
  disponible: boolean;
  isActive: boolean;
}

export interface AdicionBasica {
  id: string;
  nombre: string;
  precio: number;
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
  // Código de la encuesta de satisfacción (va en QR en la precuenta impresa).
  codigoEncuesta?: string | null;
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
  // Precio final por unidad (con adiciones y promoción).
  precioUnitario: number;
  adiciones?: { nombre: string; precio: number }[];
  precioLista?: number | null;
  promocionNombre?: string | null;
  // Partes de un mismo combo comparten comboGrupo.
  comboGrupo?: string | null;
  comboNombre?: string | null;
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

export type CanalPedido = "MESA" | "MOSTRADOR" | "DOMICILIO" | "PLATAFORMA";
export type EstadoDomicilio = "PENDIENTE" | "EN_CAMINO" | "ENTREGADO" | "FALLIDO";

export interface Domicilio {
  id: string;
  pedidoId: string;
  direccion: string | null;
  barrio: string | null;
  indicaciones: string | null;
  pagaCon: number | null;
  domiciliario: string | null;
  estado: EstadoDomicilio;
  salioEn: string | null;
  entregadoEn: string | null;
  motivoFallido: string | null;
}

export interface Plataforma {
  id: string;
  nombre: string;
  comisionPct: number;
  activa: boolean;
}

export interface Pedido {
  id: string;
  canal: CanalPedido;
  // Un pedido normal tiene mesaSesionId; un pedido de mostrador (sin mesa,
  // "para recoger") lo deja en null y usa nombreCliente/telefonoCliente.
  mesaSesionId: string | null;
  mesaSesion?: MesaSesion | null;
  nombreCliente: string | null;
  telefonoCliente: string | null;
  plataforma?: { nombre: string } | null;
  codigoPlataforma?: string | null;
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
export type MetodoPago = "EFECTIVO" | "TARJETA" | "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA" | "OTRO" | "PLATAFORMA";

export interface Pago {
  metodo: MetodoPago;
  monto: number;
}

export interface Factura {
  id: string;
  mesaSesionId: string | null;
  pedidoId: string | null;
  subtotal: number;
  // Descuento a toda la cuenta o cortesía; total = subtotal − descuento + propina.
  descuentoMonto: number;
  descuentoMotivo: string | null;
  propinaMonto: number;
  // Domicilio que paga el cliente (incluido en el total).
  envioMonto: number;
  // Lo que se queda la app de domicilios (no se le cobra al cliente).
  comisionMonto: number;
  total: number;
  estado: FacturaEstado;
  metodoPago: MetodoPago | null;
  pagos?: Pago[];
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
  canal: CanalPedido;
  ubicacion: string;
  atendidoPor: string;
  estado: "PAGADA" | "PERDIDA";
  // null si se pagó con varios métodos (ver pagos).
  metodoPago: MetodoPago | null;
  pagos: Pago[];
  subtotal: number;
  descuento: number;
  descuentoMotivo: string | null;
  descuentoAutorizadoPor: string | null;
  propina: number;
  total: number;
  // Admin que autorizó registrarla como perdida.
  autorizadaPor: string | null;
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
    descuentos: { cuentas: number; total: number };
    // Domicilios cobrados a los clientes y comisiones de las apps.
    envios: number;
    comisiones: number;
    ganancia: {
      ventasConCosto: number;
      costoVentas: number;
      descuentos: number;
      comisiones: number;
      gananciaBruta: number;
      margenPct: number | null;
      productosSinCosto: string[];
    };
  };
  porDia: { dia: string; ventas: number; cuentas: number }[];
  // Por hora del día (0–23) y día de la semana, según cuándo llegó el pedido:
  // sirve para saber cuánta gente se necesita en cada turno.
  porHora: { hora: number; pedidos: number; ventas: number }[];
  porDiaSemana: { dia: number; nombre: string; pedidos: number; ventas: number; dias: number }[];
  rotacion: {
    mesasAtendidas: number;
    duracionPromedioMin: number | null;
    comensalesPromedio: number | null;
    ticketPromedioMesa: number | null;
    vecesPorMesaAlDia: number | null;
    porMesa: { mesa: string; veces: number; duracionPromedioMin: number; ventas: number }[];
  };
  porMetodo: { metodo: MetodoPago; ventas: number; cuentas: number }[];
  porCanal: Record<CanalPedido, { ventas: number; cuentas: number }>;
  // Nombre de la sede del reporte (null = todas) y la comparación entre sedes
  // (solo viendo todas).
  sede: string | null;
  porSede: { sedeId: string; nombre: string; ventas: number; cuentas: number; propinas: number }[];
  porMesero: { meseroId: string; nombre: string; ventas: number; cuentas: number; propinas: number }[];
  porProducto: ProductoReporte[];
  porCombo: { nombre: string; vendidos: number; ventas: number }[];
  porAdicion: { nombre: string; cantidad: number; ventas: number }[];
  perdidas: CuentaReporte[];
  cancelaciones: {
    id: string;
    fecha: string;
    producto: string;
    cantidad: number;
    valor: number;
    ubicacion: string;
    canceladoPor: string;
    autorizadoPor: string | null;
    yaEnCocina: boolean;
  }[];
  cuentas: CuentaReporte[];
}

export interface OpinionCliente {
  id: string;
  calificacion: number;
  comentario: string | null;
  contexto: string;
  mesero: string | null;
  creadaEn: string;
}

export interface ReporteSatisfaccion {
  total: number;
  promedio: number | null;
  distribucion: Record<1 | 2 | 3 | 4 | 5, number>;
  porMesero: { meseroId: string; nombre: string; promedio: number; opiniones: number }[];
  recientes: OpinionCliente[];
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
  // Vendido por apps de domicilios: no entra a la caja.
  totalPlataforma?: number;
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
  adicionIds?: string[];
  adiciones?: { nombre: string; precio: number }[];
  // Precio por unidad que se cobraría al confirmarla (promoción + adiciones).
  precioEstimado?: number;
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
  | "ITEM_CANCELADO"
  | "AUTORIZACION"
  | "STOCK"
  | "LLAMADO_MESA"
  | "OPINION"
  | "FACTURACION";

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
