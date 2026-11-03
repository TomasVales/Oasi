import type { LocalDate } from './domain'
import { addDays, parseLocalDate, weekdayMon0 } from './dates'
import type { DayTotal } from './streaks'

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** Umbrales fijos (no relativos al máximo): un día de 2 h siempre se ve igual de intenso. */
export const HEAT_THRESHOLDS_MIN = [1, 30, 60, 120] as const

export function heatLevel(seconds: number): HeatLevel {
  const min = seconds / 60
  if (min < HEAT_THRESHOLDS_MIN[0]) return 0
  if (min < HEAT_THRESHOLDS_MIN[1]) return 1
  if (min < HEAT_THRESHOLDS_MIN[2]) return 2
  if (min < HEAT_THRESHOLDS_MIN[3]) return 3
  return 4
}

export interface HeatCell {
  date: LocalDate
  seconds: number
  level: HeatLevel
  /** false para los días posteriores a `end` que completan la última semana. */
  inRange: boolean
}

export interface HeatmapGrid {
  /** Columnas = semanas (lunes a domingo). */
  weeks: HeatCell[][]
  /** Índice de columna donde arranca cada mes (para las etiquetas superiores). */
  months: { column: number; month: number; year: number }[]
}

/** Grilla estilo GitHub: `weeks` semanas que terminan en la semana de `end`. */
export function buildHeatmap(totals: DayTotal[], end: LocalDate, weeks = 53): HeatmapGrid {
  const byDate = new Map(totals.map((t) => [t.localDate, t.seconds]))
  const lastMonday = addDays(end, -weekdayMon0(end))
  const firstMonday = addDays(lastMonday, -(weeks - 1) * 7)
  const grid: HeatCell[][] = []
  const months: HeatmapGrid['months'] = []
  let lastMonth = -1

  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstMonday, w * 7 + d)
      const seconds = byDate.get(date) ?? 0
      col.push({ date, seconds, level: heatLevel(seconds), inRange: date <= end })
    }
    const month = new Date(parseLocalDate(col[0]!.date)).getUTCMonth()
    if (month !== lastMonth) {
      // Etiqueta solo si hay lugar (no en la primera columna si el mes casi terminó).
      if (w > 0 || new Date(parseLocalDate(col[0]!.date)).getUTCDate() <= 7)
        months.push({ column: w, month, year: new Date(parseLocalDate(col[0]!.date)).getUTCFullYear() })
      lastMonth = month
    }
    grid.push(col)
  }
  return { weeks: grid, months }
}
