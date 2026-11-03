/**
 * Seguimiento del plan del día: cruza los bloques planificados con las sesiones
 * reales para saber qué se cumplió, qué está en curso y qué quedó atrasado.
 */
import type { EventKind } from './domain'
import type { PlannedBlock, StudyMode } from './planner'

/** Bloque tal como se guarda en la DB (fechas en ISO). */
export interface SnapshotBlock {
  subjectId: string
  start: string
  end: string
  minutes: number
  mode: StudyMode
  load: number
  milestone: { id: string; title: string; kind: EventKind; daysLeft: number } | null
  document: { id: string; title: string; pageFrom: number; pageTo: number } | null
  reasons: string[]
  score: number
}

export const toSnapshotBlock = (b: PlannedBlock): SnapshotBlock => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() })
export const fromSnapshotBlock = (b: SnapshotBlock): PlannedBlock => ({ ...b, start: new Date(b.start), end: new Date(b.end) })

export interface SessionLike {
  subjectId: string | null
  startedAt: Date
  activeSeconds: number
}

export type BlockStatus = 'done' | 'current' | 'upcoming' | 'missed'

export interface BlockProgress {
  status: BlockStatus
  /** Minutos de foco acreditados a este bloque. */
  doneMinutes: number
  /** Minutos que faltaron (solo bloques atrasados). */
  debtMinutes: number
}

/** Un bloque se da por cumplido con el 60 % de su tiempo de foco. */
export const DONE_RATIO = 0.6
/** Una sesión cuenta para un bloque si empieza hasta 15 min antes de su inicio. */
const EARLY_TOLERANCE_MS = 15 * 60_000

/**
 * Asigna cada sesión al primer bloque de su materia cuya ventana la contiene
 * (desde 15 min antes del inicio hasta el fin del bloque). Así, estudiar esa
 * materia más temprano en el día no "cumple" un bloque de la tarde.
 */
export function evaluatePlan(blocks: PlannedBlock[], sessions: SessionLike[], now: Date): BlockProgress[] {
  const credit = blocks.map(() => 0)
  for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    if (!s.subjectId || s.activeSeconds <= 0) continue
    const t = s.startedAt.getTime()
    const i = blocks.findIndex(
      (b, idx) =>
        b.subjectId === s.subjectId &&
        t >= b.start.getTime() - EARLY_TOLERANCE_MS &&
        t < b.end.getTime() &&
        credit[idx]! < b.minutes * 60
    )
    if (i >= 0) credit[i]! += s.activeSeconds
  }

  return blocks.map((b, i) => {
    const doneMinutes = Math.round(credit[i]! / 60)
    if (credit[i]! >= b.minutes * 60 * DONE_RATIO) return { status: 'done', doneMinutes, debtMinutes: 0 }
    if (now >= b.end) return { status: 'missed', doneMinutes, debtMinutes: Math.max(0, b.minutes - doneMinutes) }
    if (now >= b.start) return { status: 'current', doneMinutes, debtMinutes: 0 }
    return { status: 'upcoming', doneMinutes, debtMinutes: 0 }
  })
}

/** Minutos adeudados por materia (para que el recálculo los recupere). */
export function debtBySubject(blocks: PlannedBlock[], progress: BlockProgress[]): Record<string, number> {
  const out: Record<string, number> = {}
  blocks.forEach((b, i) => {
    const d = progress[i]!.debtMinutes
    if (d > 0) out[b.subjectId] = (out[b.subjectId] ?? 0) + d
  })
  return out
}
