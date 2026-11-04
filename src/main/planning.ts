import { isBusyKind, isMilestoneKind, toLocalDate, type EnergyLevel } from '@shared/domain'
import { addDays } from '@shared/dates'
import { planStudy, type PlanResult } from '@shared/planner'
import { debtBySubject, evaluatePlan, fromSnapshotBlock, toSnapshotBlock, type BlockProgress } from '@shared/planProgress'
import { computeStreaks, type StreakInfo } from '@shared/streaks'
import type { Repositories } from './db/repositories'

export interface PlanRequest {
  energy?: EnergyLevel
  urgentSubjectId?: string | null
  /** Momento para el que se planifica (por defecto, ahora). Permite "planificar mañana". */
  at?: Date
  /** Minutos atrasados por materia a recuperar. */
  debtMinutes?: Record<string, number>
}

export interface PlanResponse extends PlanResult {
  energy: EnergyLevel
  urgentSubjectId: string | null
  /** false si no hubo check-in hoy y se asumió energía media. */
  fromCheckIn: boolean
  /** Estado de cada bloque (solo en el plan guardado de hoy). */
  progress?: BlockProgress[]
  /** Bloques y minutos atrasados respecto del plan guardado. */
  behind?: { blocks: number; minutes: number }
  snapshot?: { reason: 'checkin' | 'auto' | 'panic'; createdAt: Date }
}

/** Junta lo que necesita el planificador desde la DB. Por defecto usa el check-in de hoy. */
export function buildPlan(repos: Repositories, req: PlanRequest = {}, realNow = new Date()): PlanResponse {
  const now = req.at && req.at > realNow ? req.at : realNow
  const today = toLocalDate(realNow)
  const checkIn = repos.checkIns.latestForDay(today)
  const energy = req.energy ?? checkIn?.energy ?? 'medium'
  const urgentSubjectId = req.urgentSubjectId !== undefined ? req.urgentSubjectId : (checkIn?.urgentSubjectId ?? null)

  const horizon = new Date(now.getTime() + 60 * 86_400_000)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const events = repos.events.listRange({ from: now, to: horizon })
  const pomodoro = repos.settings.get('pomodoro')

  const result = planStudy({
    now,
    energy,
    urgentSubjectId,
    subjects: repos.subjects.list().map((s) => ({ id: s.id, name: s.name, difficulty: s.difficulty })),
    milestones: events
      .filter((e) => isMilestoneKind(e.kind) && !e.completedAt)
      .map((e) => ({ id: e.id, subjectId: e.subjectId, kind: e.kind, title: e.title, startsAt: e.startsAt, weight: e.weight })),
    documents: repos.documents.listAll().map((d) => ({
      id: d.id,
      subjectId: d.subjectId,
      title: d.title,
      pageCount: d.pageCount,
      maxPageRead: d.maxPageRead,
      lastOpenedAt: d.lastOpenedAt
    })),
    busy: events
      // Clases, consultas, trabajo, turnos, deporte…: ocupan su horario (los de todo el día no).
      .filter((e) => isBusyKind(e.kind) && !e.allDay && e.startsAt <= endOfDay)
      .map((e) => ({
        startsAt: e.startsAt,
        endsAt: e.endsAt ?? new Date(e.startsAt.getTime() + 2 * 3_600_000),
        title: e.title
      })),
    studiedTodaySeconds: toLocalDate(now) === today ? repos.sessions.secondsBySubjectOn(today) : {},
    debtMinutes: req.debtMinutes,
    focusMinutes: pomodoro.focusMinutes,
    breakMinutes: pomodoro.shortBreakMinutes
  })

  return { ...result, energy, urgentSubjectId, fromCheckIn: !!checkIn }
}

export function streakInfo(repos: Repositories, now = new Date()): StreakInfo {
  const today = toLocalDate(now)
  const days = repos.sessions.dailyTotals(addDays(today, -800), today)
  return computeStreaks(days, today, repos.settings.get('streakMinMinutes') * 60)
}

function withProgress(repos: Repositories, plan: PlanResponse, snap: ReturnType<Repositories['plans']['latestForDay']> & {}, now: Date): PlanResponse {
  const blocks = snap.blocks.map(fromSnapshotBlock)
  const progress = evaluatePlan(blocks, repos.sessions.listForDay(snap.localDate), now)
  const missed = progress.filter((p) => p.status === 'missed')
  return {
    ...plan,
    blocks,
    progress,
    energy: snap.energy,
    urgentSubjectId: snap.urgentSubjectId,
    behind: { blocks: missed.length, minutes: missed.reduce((a, p) => a + p.debtMinutes, 0) },
    snapshot: { reason: snap.reason, createdAt: snap.createdAt }
  }
}

/**
 * Plan de HOY con memoria: se guarda la primera vez y se mantiene estable (no se corre con el
 * reloj), así se puede ver qué bloques se cumplieron y cuáles quedaron atrasados.
 * Se rehace solo si hubo un check-in posterior. Los planes vacíos no se guardan.
 */
export function todayPlan(repos: Repositories, now = new Date()): PlanResponse {
  const today = toLocalDate(now)
  const checkIn = repos.checkIns.latestForDay(today)
  const snap = repos.plans.latestForDay(today)
  const fresh = buildPlan(repos, {}, now)

  if (snap && !(checkIn && checkIn.createdAt > snap.createdAt)) return withProgress(repos, fresh, snap, now)
  if (!fresh.blocks.length) return { ...fresh, progress: [], behind: { blocks: 0, minutes: 0 } }

  const saved = repos.plans.create({
    localDate: today,
    reason: checkIn && (!snap || checkIn.createdAt > snap.createdAt) ? 'checkin' : 'auto',
    energy: fresh.energy,
    urgentSubjectId: fresh.urgentSubjectId,
    blocks: fresh.blocks.map(toSnapshotBlock),
    createdAt: now
  })
  return withProgress(repos, fresh, saved, now)
}

export interface RecalcRequest {
  /** Energía actual (si cambió desde el check-in). */
  energy?: EnergyLevel
  /** true = las materias con bloques atrasados suben de prioridad para recuperar ese tiempo. */
  recover: boolean
}

/** "Recálculo de pánico": rearma el resto del día desde ahora, sin esperar al check-in de mañana. */
export function recalculatePlan(repos: Repositories, req: RecalcRequest, now = new Date()): PlanResponse {
  const today = toLocalDate(now)
  const current = todayPlan(repos, now)
  const checkIn = repos.checkIns.latestForDay(today)
  if (req.energy && req.energy !== (checkIn?.energy ?? current.energy)) {
    // Un cambio de energía cuenta como check-in nuevo (lo usa el resto del día).
    repos.checkIns.create({ energy: req.energy, urgentSubjectId: checkIn?.urgentSubjectId ?? null }, new Date(now.getTime() - 1))
  }
  const debt = req.recover && current.progress ? debtBySubject(current.blocks, current.progress) : {}
  const fresh = buildPlan(repos, { energy: req.energy ?? current.energy, debtMinutes: debt }, now)
  const saved = repos.plans.create({
    localDate: today,
    reason: 'panic',
    energy: fresh.energy,
    urgentSubjectId: fresh.urgentSubjectId,
    blocks: fresh.blocks.map(toSnapshotBlock),
    createdAt: now
  })
  return withProgress(repos, fresh, saved, now)
}
