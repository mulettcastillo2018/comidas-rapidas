// Clientes frecuentes y programa de puntos.

export interface ProgramaPuntos {
  activo: boolean;
  pesosPorPunto: number;
  valorPunto: number;
  minimoCanje: number;
}

export interface ClienteFrecuente {
  id: string;
  nombre: string;
  telefono: string;
  puntos: number;
  valorPuntos: number;
  puedeCanjear: boolean;
}

export interface ClienteAdmin {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  puntos: number;
  visitas: number;
  totalGastado: number;
  ultimaVisita: string | null;
  creadoEn: string;
}

export interface MovimientoPuntos {
  id: string;
  tipo: "ACUMULADO" | "CANJE" | "DEVOLUCION" | "AJUSTE";
  puntos: number;
  saldo: number;
  nota: string | null;
  creadoEn: string;
  usuario: string | null;
}

// Lo que se manda al generar la cuenta o al cobrar.
export interface ClienteDeCuenta {
  clienteId: string;
  canjearPuntos?: number;
  // Solo para mostrar en pantalla: lo que descuentan los puntos (no se envía).
  valorCanje?: number;
}

export function paraEnviar(c: ClienteDeCuenta | null) {
  if (!c) return undefined;
  return { clienteId: c.clienteId, ...(c.canjearPuntos ? { canjearPuntos: c.canjearPuntos } : {}) };
}

// Una sola consulta por pestaña.
let programa: Promise<ProgramaPuntos | null> | null = null;
export function consultarPrograma(token: string, cargar: (ruta: string, token: string) => Promise<ProgramaPuntos>) {
  programa ??= cargar("/clientes/programa", token).catch(() => {
    programa = null;
    return null;
  });
  return programa;
}
