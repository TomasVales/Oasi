import type { LocalDate } from './domain'
import { addDays, diffDays } from './dates'

export interface DayTotal {
  localDate: LocalDate
  seconds: number
}

export interface StreakInfo {
  /** Días seguidos hasta hoy (o hasta ayer, si hoy todavía no se estudió: la racha sigue viva). */
  current: number
  longest: number
  studiedToday: boolean
  /** Minutos que faltan hoy para sumar el día a la racha (0 si ya cuenta). */
  minutesLeftToday: number
}

export function computeStreaks(days: DayTotal[], today: LocalDate, minSeconds: number): StreakInfo {
  const counts = new Set(days.filter((d) => d.seconds >= minSeconds).map((d) => d.localDate))
  const todaySeconds = days.find((d) => d.localDate === today)?.seconds ?? 0
  const studiedToday = counts.has(today)

  let current = 0
  let cursor = studiedToday ? today : addDays(today, -1)
  while (counts.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  let longest = 0
  let run = 0
  let prev: LocalDate | null = null
  for (const d of [...counts].sort()) {
    run = prev !== null && diffDays(d, prev) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }

  return {
    current,
    longest: Math.max(longest, current),
    studiedToday,
    minutesLeftToday: studiedToday ? 0 : Math.ceil((minSeconds - todaySeconds) / 60)
  }
}
