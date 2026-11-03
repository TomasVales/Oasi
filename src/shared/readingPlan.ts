/**
 * Distribución de carga de lectura: cruza las páginas que faltan de un PDF con los días
 * hasta el examen. Es aritmética exacta (no la hace la IA: los modelos de lenguaje se
 * equivocan con cuentas); la IA solo agrega consejos sobre ESTE plan ya calculado.
 */
import type { LocalDate } from './domain'
import { addDays, diffDays } from './dates'

export interface ReadingPlanInput {
  pageCount: number
  /** Última página leída (0 = sin empezar). */
  pagesRead: number
  today: LocalDate
  examDate: LocalDate
  /** Días previos al examen reservados para repasar (sin páginas nuevas). Por defecto 1. */
  reviewDays?: number
  /** Días de la semana sin estudio (0 = lunes … 6 = domingo). */
  restWeekdays?: number[]
}

export interface ReadingSession {
  date: LocalDate
  pageFrom: number
  pageTo: number
}

export type ReadingPlanStatus = 'ok' | 'tight' | 'done' | 'no-time'

export interface ReadingPlan {
  status: ReadingPlanStatus
  remainingPages: number
  daysUntilExam: number
  studyDays: number
  pagesPerSession: number
  sessions: ReadingSession[]
  reviewFrom: LocalDate | null
}

/** Más de esto por sesión se marca como ajustado. */
export const TIGHT_PAGES_PER_SESSION = 40

export function buildReadingPlan(input: ReadingPlanInput): ReadingPlan {
  const remaining = Math.max(0, input.pageCount - input.pagesRead)
  const daysUntilExam = diffDays(input.examDate, input.today)
  const reviewDays = Math.max(0, input.reviewDays ?? 1)
  const rest = new Set(input.restWeekdays ?? [])
  const base = { remainingPages: remaining, daysUntilExam }

  if (remaining === 0) return { ...base, status: 'done', studyDays: 0, pagesPerSession: 0, sessions: [], reviewFrom: null }

  // Días de lectura: desde hoy hasta antes del repaso (si no alcanza, se sacrifica el repaso).
  const lastReadingOffset = daysUntilExam - 1 - (daysUntilExam - 1 > reviewDays ? reviewDays : 0)
  const days: LocalDate[] = []
  for (let i = 0; i <= lastReadingOffset; i++) {
    const d = addDays(input.today, i)
    const weekday = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7
    if (!rest.has(weekday)) days.push(d)
  }
  if (!days.length) return { ...base, status: 'no-time', studyDays: 0, pagesPerSession: remaining, sessions: [], reviewFrom: null }

  // Reparto parejo: los primeros días llevan una página más si no divide exacto.
  const per = Math.floor(remaining / days.length)
  const extra = remaining % days.length
  const sessions: ReadingSession[] = []
  let next = input.pagesRead + 1
  days.forEach((date, i) => {
    const n = per + (i < extra ? 1 : 0)
    if (n === 0) return
    sessions.push({ date, pageFrom: next, pageTo: next + n - 1 })
    next += n
  })

  const pagesPerSession = Math.ceil(remaining / days.length)
  const reviewFrom = daysUntilExam - 1 > reviewDays && reviewDays > 0 ? addDays(input.examDate, -reviewDays) : null
  return {
    ...base,
    status: pagesPerSession > TIGHT_PAGES_PER_SESSION ? 'tight' : 'ok',
    studyDays: days.length,
    pagesPerSession,
    sessions,
    reviewFrom
  }
}
