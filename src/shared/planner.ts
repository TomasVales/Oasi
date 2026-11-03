/**
 * Planificador: decide QUÉ estudiar AHORA y en qué orden, cruzando fechas de parciales
 * y entregas, la dificultad de cada materia, la energía declarada en el check-in y el
 * tiempo libre hasta la próxima clase. Determinístico y sin IA: es testeable y explicable
 * (cada bloque trae sus razones en texto).
 */
import type { EnergyLevel, EventKind } from './domain'

export type StudyMode = 'profundo' | 'practica' | 'repaso'

export interface PlannerSubject {
  id: string
  name: string
  difficulty: number
}

export interface PlannerMilestone {
  id: string
  subjectId: string | null
  kind: EventKind
  title: string
  startsAt: Date
  weight: number
}

export interface PlannerDocument {
  id: string
  subjectId: string
  title: string
  pageCount: number
  maxPageRead: number
  lastOpenedAt: Date | null
}

export interface BusyInterval {
  startsAt: Date
  endsAt: Date
  title: string
}

export interface PlannerInput {
  now: Date
  energy: EnergyLevel
  urgentSubjectId: string | null
  subjects: PlannerSubject[]
  milestones: PlannerMilestone[]
  documents: PlannerDocument[]
  busy: BusyInterval[]
  /** Segundos ya estudiados hoy por materia (rendimientos decrecientes). */
  studiedTodaySeconds: Record<string, number>
  /** Minutos atrasados por materia que el recálculo intenta recuperar. */
  debtMinutes?: Record<string, number>
  focusMinutes: number
  breakMinutes: number
  /** Hora local a partir de la cual no se sugiere estudiar. */
  dayEndHour?: number
  /** Antes de esta hora (madrugada) tampoco se sugiere estudiar. */
  dayStartHour?: number
  maxBlocks?: number
}

export interface PlannedBlock {
  subjectId: string
  start: Date
  end: Date
  minutes: number
  mode: StudyMode
  /** 1–5: carga cognitiva estimada del bloque. */
  load: number
  milestone: { id: string; title: string; kind: EventKind; daysLeft: number } | null
  document: { id: string; title: string; pageFrom: number; pageTo: number } | null
  reasons: string[]
  score: number
}

export interface PlanResult {
  blocks: PlannedBlock[]
  /** Minutos libres considerados (hasta fin del día, descontando clases). */
  freeMinutes: number
  nextBusy: BusyInterval | null
}

const DAY = 86_400_000
const MODE_LABEL: Record<StudyMode, string> = { profundo: 'Estudio profundo', practica: 'Práctica', repaso: 'Repaso' }
export const studyModeLabel = (m: StudyMode) => MODE_LABEL[m]

/** Carga cognitiva ideal según la energía declarada. */
export const TARGET_LOAD: Record<EnergyLevel, number> = { high: 5, medium: 3.5, low: 2 }

/** Duración de cada bloque según la energía (con energía baja, bloques cortos). */
export function blockMinutes(energy: EnergyLevel, focusMinutes: number): number {
  const factor = energy === 'high' ? 1 : energy === 'medium' ? 0.8 : 0.5
  return Math.max(15, Math.round((focusMinutes * factor) / 5) * 5)
}

function modeLoad(mode: StudyMode, difficulty: number): number {
  if (mode === 'profundo') return difficulty
  if (mode === 'practica') return Math.max(1, difficulty - 1)
  return Math.max(1, difficulty - 2)
}

const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`

interface Candidate {
  subject: PlannerSubject
  priority: number
  nearest: { m: PlannerMilestone; daysLeft: number } | null
  reasons: string[]
}

function subjectPriorities(input: PlannerInput): Candidate[] {
  return input.subjects.map((subject) => {
    const reasons: string[] = []
    const upcoming = input.milestones
      .filter((m) => m.subjectId === subject.id && m.startsAt.getTime() > input.now.getTime())
      .map((m) => ({ m, daysLeft: (m.startsAt.getTime() - input.now.getTime()) / DAY }))
      .filter((x) => x.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)

    // Urgencia: cada hito suma peso / días restantes (los exámenes pesan más que las entregas).
    let priority = 0.04 * subject.difficulty
    for (const { m, daysLeft } of upcoming) {
      const kindFactor = m.kind === 'exam' ? 1.3 : m.kind === 'assignment' ? 1 : 0.5
      priority += (m.weight * kindFactor) / Math.max(daysLeft, 0.25) ** 0.9
    }

    const nearest = upcoming[0] ?? null
    if (nearest) {
      const d = Math.max(0, Math.ceil(nearest.daysLeft))
      const what = nearest.m.kind === 'exam' ? 'Parcial' : nearest.m.kind === 'assignment' ? 'Entrega' : nearest.m.title
      reasons.push(d <= 1 ? `${what} mañana` : `${what} en ${plural(d, 'día')}`)
    }

    const hoursToday = (input.studiedTodaySeconds[subject.id] ?? 0) / 3600
    if (hoursToday > 0) priority /= 1 + hoursToday * 0.6


    return { subject, priority, nearest, reasons }
  })
}

/** Prioridad extra por tiempo atrasado (con tope, para no monopolizar el día). */
const debtBoost = (minutes: number) => Math.min(Math.max(minutes, 0) / 60, 2) * 0.9

/** Lo que el usuario declara en el check-in manda: la materia urgente pasa al frente. */
function applyUrgency(candidates: Candidate[], urgentId: string | null): Candidate[] {
  const urgent = candidates.find((c) => c.subject.id === urgentId)
  if (!urgent) return candidates
  const topOther = Math.max(0, ...candidates.filter((c) => c !== urgent).map((c) => c.priority))
  urgent.priority = Math.max(urgent.priority * 1.5, topOther * 1.25)
  urgent.reasons.unshift('La marcaste como urgente')
  return candidates
}

function pickMode(c: Candidate, targetLoad: number): { mode: StudyMode; load: number; score: number } {
  const daysLeft = c.nearest?.daysLeft ?? Infinity
  // Muy cerca del examen, repasar rinde más que ver temas nuevos.
  const value: Record<StudyMode, number> =
    daysLeft <= 2 ? { profundo: 0.8, practica: 1, repaso: 1.1 } : { profundo: 1, practica: 0.92, repaso: 0.75 }
  let best = { mode: 'profundo' as StudyMode, load: 0, score: -Infinity }
  for (const mode of ['profundo', 'practica', 'repaso'] as const) {
    const load = modeLoad(mode, c.subject.difficulty)
    const fit = 1 / (1 + 0.45 * Math.abs(targetLoad - load))
    const score = c.priority * fit * value[mode]
    if (score > best.score) best = { mode, load, score }
  }
  return best
}

function pagesFor(input: PlannerInput, subjectId: string, daysLeft: number | null) {
  const docs = input.documents
    .filter((d) => d.subjectId === subjectId && d.maxPageRead < d.pageCount)
    .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))
  const doc = docs[0]
  if (!doc) return null
  const remaining = doc.pageCount - doc.maxPageRead
  // Una sesión por día hasta el hito; sin hito, se reparte en dos semanas.
  const sessions = daysLeft === null ? 14 : Math.max(1, Math.floor(daysLeft))
  const perSession = Math.max(1, Math.ceil(remaining / sessions))
  const pageFrom = doc.maxPageRead + 1
  const pageTo = Math.min(doc.pageCount, doc.maxPageRead + perSession)
  return {
    document: { id: doc.id, title: doc.title, pageFrom, pageTo },
    reason:
      daysLeft === null
        ? `${doc.title}: págs. ${pageFrom}–${pageTo}`
        : `Quedan ${remaining} págs. en ${plural(sessions, 'día')} → ${perSession} por sesión`
  }
}

/** Huecos libres desde `from` hasta `until`, descontando clases. */
function freeSlots(from: Date, until: Date, busy: BusyInterval[]): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = []
  let cursor = from.getTime()
  const sorted = busy
    .filter((b) => b.endsAt.getTime() > cursor && b.startsAt.getTime() < until.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  for (const b of sorted) {
    if (b.startsAt.getTime() > cursor) slots.push({ start: new Date(cursor), end: b.startsAt })
    cursor = Math.max(cursor, b.endsAt.getTime())
  }
  if (cursor < until.getTime()) slots.push({ start: new Date(cursor), end: until })
  return slots
}

export function planStudy(input: PlannerInput): PlanResult {
  const dayEndHour = input.dayEndHour ?? 23
  const dayStartHour = input.dayStartHour ?? 6
  const lateNight = input.now.getHours() < dayStartHour
  const maxBlocks = input.maxBlocks ?? 4
  const dur = blockMinutes(input.energy, input.focusMinutes)

  // Arranca en el próximo múltiplo de 5 minutos.
  const start = new Date(Math.ceil(input.now.getTime() / 300_000) * 300_000)
  const dayEnd = new Date(input.now)
  dayEnd.setHours(dayEndHour, 0, 0, 0)

  const nextBusy =
    input.busy
      .filter((b) => b.endsAt.getTime() > input.now.getTime())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null

  // De madrugada (antes de dayStartHour) no se planifica: es la misma "noche" que pasadas las 23 h.
  const slots = start < dayEnd && !lateNight ? freeSlots(start, dayEnd, input.busy) : []
  const freeMinutes = Math.round(slots.reduce((acc, s) => acc + (s.end.getTime() - s.start.getTime()), 0) / 60_000)

  const candidates = applyUrgency(subjectPriorities(input), input.urgentSubjectId)
  if (!candidates.length) return { blocks: [], freeMinutes, nextBusy }

  const blocks: PlannedBlock[] = []
  let targetLoad = TARGET_LOAD[input.energy]
  const usedBySubject = new Map<string, number>()
  // Deuda que todavía falta recuperar: se descuenta a medida que se planifican bloques.
  const debtLeft = new Map(Object.entries(input.debtMinutes ?? {}).filter(([, m]) => m > 0))

  for (const slot of slots) {
    let t = slot.start.getTime()
    while (blocks.length < maxBlocks) {
      const minutes = Math.min(dur, Math.floor((slot.end.getTime() - t) / 60_000))
      if (minutes < 15) break

      let best: { c: Candidate; mode: StudyMode; load: number; score: number } | null = null
      // Regla explícita: el primer bloque es la materia que el usuario marcó como urgente.
      const urgent = candidates.find((c) => c.subject.id === input.urgentSubjectId)
      const pool = blocks.length === 0 && urgent ? [urgent] : candidates
      for (const c of pool) {
        const used = usedBySubject.get(c.subject.id) ?? 0
        // Intercalar materias (práctica intercalada): cada repetición vale un tercio.
        const penalized = { ...c, priority: (c.priority + debtBoost(debtLeft.get(c.subject.id) ?? 0)) / 3 ** used }
        const pick = pickMode(penalized, targetLoad)
        if (!best || pick.score > best.score) best = { c, ...pick }
      }
      if (!best) break

      const { c, mode, load, score } = best
      const daysLeft = c.nearest ? c.nearest.daysLeft : null
      const pages = mode === 'repaso' ? null : pagesFor(input, c.subject.id, daysLeft)
      const reasons = [...c.reasons]
      const owed = debtLeft.get(c.subject.id) ?? 0
      if (owed > 0) {
        const recovered = Math.min(minutes, owed)
        reasons.unshift(recovered < owed ? `Recuperás ${recovered} de ${owed} min atrasados` : `Recuperás ${owed} min atrasados`)
        debtLeft.set(c.subject.id, owed - recovered)
      }
      if (load >= 4 && input.energy === 'high') reasons.push('Carga alta: aprovechá la energía')
      if (input.energy === 'low' && mode === 'repaso') reasons.push('Energía baja: repaso liviano')
      if (pages) reasons.push(pages.reason)

      blocks.push({
        subjectId: c.subject.id,
        start: new Date(t),
        end: new Date(t + minutes * 60_000),
        minutes,
        mode,
        load,
        milestone: c.nearest
          ? { id: c.nearest.m.id, title: c.nearest.m.title, kind: c.nearest.m.kind, daysLeft: c.nearest.daysLeft }
          : null,
        document: pages?.document ?? null,
        reasons,
        score: Math.round(score * 1000) / 1000
      })

      usedBySubject.set(c.subject.id, (usedBySubject.get(c.subject.id) ?? 0) + 1)
      // Fatiga: cada bloque baja un poco la carga ideal del siguiente.
      targetLoad = Math.max(1, targetLoad - 0.75)
      t += (minutes + input.breakMinutes) * 60_000
    }
  }

  return { blocks, freeMinutes, nextBusy }
}
