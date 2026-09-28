// "Ana María Pérez" → "Ana P.": para pantallas públicas, donde basta con que
// el cliente se reconozca sin mostrar su nombre completo a todo el local.
export function nombreCorto(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

export function nombreCompleto(persona: { nombre: string; apellido: string } | null | undefined): string {
  if (!persona) return "";
  return [persona.nombre, persona.apellido].filter(Boolean).join(" ");
}
