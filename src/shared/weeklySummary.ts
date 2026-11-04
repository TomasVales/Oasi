import { addDays, weekdayMon0 } from './dates'
import { toLocalDate, type LocalDate } from './domain'

export interface SummarySession {
  subjectId: string | null
  localDate: LocalDate
  activeSeconds: number
  focusScore: number | null
}

export interface SummarySubject {
  id: string
  name: string
  color: string
  weeklyGoalMinutes: number | null
}

export interface WeekSummary {
  weekStart: LocalDate
  weekEnd: LocalDate
  totalSeconds: number
  prevTotalSeconds: number
  /** Variación contra la semana anterior (0.25 = +25 %); null si la anterior fue 0. */
  delta: number | null
  daysStudied: number
  /** Segundos por día, lunes a domingo. */
  days: { date: LocalDate; seconds: number }[]
  bestDay: { date: LocalDate; seconds: number } | null
  sessions: number
  /** 0–1, promedio de las sesiones calificadas (ponderado por duración). */
  avgFocus: number | null
  subjects: { id: string | null; name: string; color: string | null; seconds: number; goalSeconds: number | null }[]
  goalsMet: number
  goalsTotal: number
}

/** Lunes de la semana de `date`. */
export const weekStartOf = (date: LocalDate): LocalDate => addDays(date, -weekdayMon0(date))

/**
 * Qué semana resumir al abrir la app: el domingo desde las 18 h, la que termina hoy;
 * cualquier otro momento, la semana pasada.
 */
export function weekToSummarize(now: Date): LocalDate {
  const today = toLocalDate(now)
  const monday = weekStartOf(today)
  return weekdayMon0(today) === 6 && now.getHours() >= 18 ? monday : addDays(monday, -7)
}

export function summarizeWeek(input: {
  weekStart: LocalDate
  sessions: SummarySession[]
  prevTotalSeconds: number
  subjects: SummarySubject[]
}): WeekSummary {
  const { weekStart, subjects } = input
  const weekEnd = addDays(weekStart, 6)
  const inWeek = input.sessions.filter((s) => s.localDate >= weekStart && s.localDate <= weekEnd)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    return { date, seconds: inWeek.filter((s) => s.localDate === date).reduce((a, s) => a + s.activeSeconds, 0) }
  })
  const totalSeconds = days.reduce((a, d) => a + d.seconds, 0)
  const best = days.reduce<{ date: LocalDate; seconds: number } | null>((b, d) => (d.seconds > (b?.seconds ?? 0) ? d : b), null)

  const scored = inWeek.filter((s) => s.focusScore !== null && s.activeSeconds > 0)
  const scoredSeconds = scored.reduce((a, s) => a + s.activeSeconds, 0)
  const avgFocus = scoredSeconds ? scored.reduce((a, s) => a + s.focusScore! * s.activeSeconds, 0) / scoredSeconds : null

  const bySubject = new Map<string | null, number>()
  for (const s of inWeek) bySubject.set(s.subjectId, (bySubject.get(s.subjectId) ?? 0) + s.activeSeconds)
  const known = new Map(subjects.map((s) => [s.id, s]))
  const rows: WeekSummary['subjects'] = []
  // Materias con meta (aunque no se hayan estudiado) + cualquier otra que se haya estudiado.
  for (const s of subjects) {
    const seconds = bySubject.get(s.id) ?? 0
    if (s.weeklyGoalMinutes || seconds > 0)
      rows.push({ id: s.id, name: s.name, color: s.color, seconds, goalSeconds: s.weeklyGoalMinutes ? s.weeklyGoalMinutes * 60 : null })
  }
  for (const [id, seconds] of bySubject) {
    if (id !== null && known.has(id)) continue
    if (seconds > 0) rows.push({ id, name: id === null ? 'Sin materia' : 'Materia borrada', color: null, seconds, goalSeconds: null })
  }
  rows.sort((a, b) => b.seconds - a.seconds)
  const withGoal = rows.filter((r) => r.goalSeconds)

  return {
    weekStart,
    weekEnd,
    totalSeconds,
    prevTotalSeconds: input.prevTotalSeconds,
    delta: input.prevTotalSeconds > 0 ? (totalSeconds - input.prevTotalSeconds) / input.prevTotalSeconds : null,
    daysStudied: days.filter((d) => d.seconds >= 60).length,
    days,
    bestDay: best && best.seconds >= 60 ? best : null,
    sessions: inWeek.length,
    avgFocus,
    subjects: rows,
    goalsMet: withGoal.filter((r) => r.seconds >= r.goalSeconds!).length,
    goalsTotal: withGoal.length
  }
}
