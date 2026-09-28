// Dirección pública del sitio para lo que se imprime (QR de mesas, encuesta
// en la precuenta): NEXT_PUBLIC_URL_PUBLICA si está configurada; si no, la
// dirección desde donde se abrió el panel.
export function urlPublica(): string {
  return (process.env.NEXT_PUBLIC_URL_PUBLICA || window.location.origin).replace(/\/$/, "");
}

// localhost o la IP del wifi: sirve para probar, no para imprimir definitivo.
export function esDireccionLocal(url: string): boolean {
  const host = new URL(url).hostname;
  return (
    host === "localhost" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local")
  );
}
