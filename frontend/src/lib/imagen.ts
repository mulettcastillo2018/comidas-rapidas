// Una foto de celular pesa 3–8 MB y mide 4000 px; en la carta se muestra a
// menos de 200 px. Se reduce en el navegador antes de subirla: carga más
// rápido para el cliente (que suele estar con datos móviles) y ocupa mucho
// menos espacio en el servidor.
const LADO_MAXIMO = 800;
const CALIDAD = 0.82;

export async function reducirImagen(archivo: File): Promise<File> {
  // Los GIF pueden ser animados: se dejan tal cual.
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif") return archivo;
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagen.width * escala);
    canvas.height = Math.round(imagen.height * escala);
    canvas.getContext("2d")?.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    imagen.close();
    const reducida = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", CALIDAD));
    // Si el navegador no sabe generar WebP o no se ganó nada, se sube la original.
    if (!reducida || reducida.type !== "image/webp" || reducida.size >= archivo.size) return archivo;
    return new File([reducida], `${archivo.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  } catch {
    return archivo;
  }
}
