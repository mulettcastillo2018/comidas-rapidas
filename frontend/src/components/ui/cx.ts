/** Une clases utilitarias e ignora las condicionales que no aplican. */
export function cx(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(" ");
}
