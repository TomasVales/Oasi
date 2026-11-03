/**
 * Paleta categórica de materias (orden fijo, validada para daltonismo con el validador
 * de dataviz en fondo claro y en los tres fondos oscuros). Se guarda el tono claro;
 * en temas oscuros se usa su variante escalonada para ese fondo.
 */
export const SUBJECT_PALETTE = [
  { name: 'Azul', light: '#2a78d6', dark: '#3987e5' },
  { name: 'Naranja', light: '#eb6834', dark: '#d95926' },
  { name: 'Aqua', light: '#1baf7a', dark: '#199e70' },
  { name: 'Amarillo', light: '#eda100', dark: '#c98500' },
  { name: 'Magenta', light: '#e87ba4', dark: '#d55181' },
  { name: 'Verde', light: '#008300', dark: '#008300' },
  { name: 'Violeta', light: '#6250d6', dark: '#9085e9' },
  { name: 'Rojo', light: '#e34948', dark: '#e66767' }
] as const

export const SUBJECT_COLORS: readonly string[] = SUBJECT_PALETTE.map((c) => c.light)

/** Color de una materia para el modo actual. Colores fuera de la paleta se devuelven tal cual. */
export function resolveSubjectColor(stored: string, dark: boolean): string {
  const entry = SUBJECT_PALETTE.find((c) => c.light === stored.toLowerCase() || c.dark === stored.toLowerCase())
  if (!entry) return stored
  return dark ? entry.dark : entry.light
}

/** Siguiente color libre en orden fijo (nunca se genera un tono nuevo). */
export function nextSubjectColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return SUBJECT_COLORS.find((c) => !taken.has(c)) ?? SUBJECT_COLORS[used.length % SUBJECT_COLORS.length]!
}
