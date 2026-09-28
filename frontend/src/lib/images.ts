const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

// Si es una URL completa (alguien la pegó a mano), se usa tal cual; si es una
// ruta relativa (subida desde el admin), se antepone la URL del backend que
// la sirve.
export function resolverImagenUrl(imagenUrl: string | null | undefined): string | null {
  if (!imagenUrl) return null;
  if (imagenUrl.startsWith("http://") || imagenUrl.startsWith("https://")) return imagenUrl;
  return `${API_URL}${imagenUrl}`;
}
