// Límite de eventos por clave en una ventana de tiempo deslizante, en memoria
// (suficiente para un solo servidor; si algún día hay varios, habría que
// moverlo a algo compartido como Redis).
export function crearLimitador(maximo: number, ventanaMs: number) {
  const registros = new Map<string, number[]>();

  function recientes(clave: string) {
    const ahora = Date.now();
    const vigentes = (registros.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
    if (vigentes.length === 0) registros.delete(clave);
    else registros.set(clave, vigentes);
    return vigentes;
  }

  return {
    excedido: (clave: string) => recientes(clave).length >= maximo,
    registrar: (clave: string) => registros.set(clave, [...recientes(clave), Date.now()]),
    reiniciar: (clave: string) => registros.delete(clave),
  };
}
