export function nombreCompleto(persona: { nombre: string; apellido: string } | null | undefined): string {
  if (!persona) return "";
  return [persona.nombre, persona.apellido].filter(Boolean).join(" ");
}
