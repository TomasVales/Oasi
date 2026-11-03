import type { LocalDate } from './domain'

/** Aritmética sobre días calendario 'YYYY-MM-DD' en UTC: inmune a cambios de horario (DST). */
export function parseLocalDate(d: LocalDate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, day)
}

export function formatUtcDay(ms: number): LocalDate {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export const addDays = (d: LocalDate, n: number): LocalDate => formatUtcDay(parseLocalDate(d) + n * 86_400_000)

export const diffDays = (a: LocalDate, b: LocalDate): number => Math.round((parseLocalDate(a) - parseLocalDate(b)) / 86_400_000)

/** 0 = lunes … 6 = domingo. */
export const weekdayMon0 = (d: LocalDate): number => (new Date(parseLocalDate(d)).getUTCDay() + 6) % 7
