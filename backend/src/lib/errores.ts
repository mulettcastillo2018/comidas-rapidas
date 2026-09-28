// Error esperado de la lógica de negocio (conflicto, dato inválido, permiso):
// se puede lanzar desde dentro de una transacción para abortarla, y el
// manejador global de errores lo convierte en una respuesta con su código
// HTTP y su mensaje, en vez de un 500 genérico.
export class ErrorDeNegocio extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
