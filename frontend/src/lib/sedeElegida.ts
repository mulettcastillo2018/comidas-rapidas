// La sede que eligió el administrador general en este navegador (va en cada
// petición y en la conexión en vivo). Quien pertenece a una sede no elige: el
// servidor ignora este valor.
const CLAVE = "comidas-sede";

export function sedeElegida(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

// Cambiar de sede recarga la página: así todo (mesas, cocina, caja, la
// conexión en vivo) se vuelve a cargar de la sede nueva.
export function elegirSede(id: string) {
  try {
    window.localStorage.setItem(CLAVE, id);
  } catch {
    // Sin almacenamiento se queda en la principal.
  }
  window.location.reload();
}
