export type UserRole = "ADMIN" | "MESERO" | "COCINA";

export interface AuthUser {
  id: string;
  name: string;
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
  meseroAsignado?: { id: string; name: string } | null;
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
  mesero?: { id: string; name: string };
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
  cambiadoPor: { id: string; name: string; role: UserRole };
}

export interface Pedido {
  id: string;
  mesaSesionId: string;
  mesaSesion?: MesaSesion;
  meseroId: string;
  estado: PedidoEstado;
  notasGenerales: string | null;
  creadoEn: string;
  iniciadoEn: string | null;
  listoEn: string | null;
  entregadoEn: string | null;
  items: PedidoItem[];
  statusLogs?: PedidoStatusLog[];
}

export type FacturaEstado = "PENDIENTE" | "PAGADA";
export type MetodoPago = "EFECTIVO" | "TARJETA" | "OTRO";

export interface Factura {
  id: string;
  mesaSesionId: string;
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

export interface CategoriaConCarta extends Categoria {
  productos: Producto[];
}

export type NotificacionTipo = "PEDIDO_NUEVO" | "ITEM_RETRASADO" | "ITEM_LISTO";

export interface Notificacion {
  id: string;
  userId: string;
  tipo: NotificacionTipo;
  mensaje: string;
  pedidoId: string | null;
  pedidoItemId: string | null;
  leida: boolean;
  creadaEn: string;
}
