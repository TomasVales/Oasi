/**
 * Tarjetas de repaso escritas dentro de los apuntes, una por línea:
 *
 *     ¿Qué dice el teorema de Bolzano? :: Si f es continua en [a,b] y cambia de signo, tiene una raíz.
 *
 * Se ignoran los bloques de código. Viñetas, citas y negritas alrededor se limpian.
 */
export interface ParsedCard {
  front: string
  back: string
}

const SEP = /\s+::\s+/

function clean(s: string): string {
  return s
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '') // viñetas y listas numeradas
    .replace(/^\s*>\s?/, '') // citas
    .replace(/^\s*#{1,6}\s+/, '') // títulos
    .replace(/\\([:*_`[\]])/g, '$1') // escapes de Markdown
    .trim()
}

export function parseFlashcards(markdown: string): ParsedCard[] {
  const cards: ParsedCard[] = []
  const seen = new Set<string>()
  let inCode = false
  for (const raw of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const line = clean(raw.replace(/\\:/g, ':'))
    const m = SEP.exec(line)
    if (!m) continue
    const front = line.slice(0, m.index).trim()
    const back = line.slice(m.index + m[0].length).trim()
    if (!front || !back) continue
    const key = normalizeFront(front)
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({ front, back })
  }
  return cards
}

const normalizeFront = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** FNV-1a de 32 bits en base 36: id estable de la tarjeta a partir de su pregunta. */
export function cardId(noteId: string, front: string): string {
  let h = 0x811c9dc5
  for (const ch of normalizeFront(front)) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${noteId}:${h.toString(36)}`
}

// ─── Repetición espaciada (SM-2 simplificado) ────────────────────────────────
export const GRADES = ['again', 'hard', 'good', 'easy'] as const
export type Grade = (typeof GRADES)[number]

export interface CardSchedule {
  ease: number
  intervalDays: number
  reps: number
  lapses: number
}

export const NEW_CARD: CardSchedule = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 }

const DAY = 86_400_000
const AGAIN_MS = 10 * 60_000

/**
 * Próximo repaso. Con un parcial cerca de la materia (`examInDays`), el intervalo no pasa
 * del día anterior al parcial: todo lo que estudiaste vuelve a aparecer antes de rendir.
 */
export function scheduleReview(
  s: CardSchedule,
  grade: Grade,
  now: number,
  examInDays: number | null = null
): CardSchedule & { dueAt: number } {
  if (grade === 'again') {
    return { ease: Math.max(1.3, s.ease - 0.2), intervalDays: 0, reps: 0, lapses: s.lapses + 1, dueAt: now + AGAIN_MS }
  }
  let ease = s.ease
  let interval: number
  if (grade === 'hard') {
    ease = Math.max(1.3, ease - 0.15)
    interval = Math.max(1, s.intervalDays * 1.2)
  } else if (grade === 'good') {
    interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : s.intervalDays * ease
  } else {
    ease += 0.15
    interval = s.reps === 0 ? 3 : Math.max(4, s.intervalDays * ease * 1.3)
  }
  if (examInDays !== null && examInDays >= 1) interval = Math.min(interval, Math.max(1, examInDays - 1))
  interval = Math.round(interval * 10) / 10
  return { ease, intervalDays: interval, reps: s.reps + 1, lapses: s.lapses, dueAt: now + interval * DAY }
}

/** Texto corto del próximo repaso para los botones ("10 min", "3 días"). */
export function intervalLabel(s: CardSchedule, grade: Grade, examInDays: number | null = null): string {
  const next = scheduleReview(s, grade, 0, examInDays)
  if (grade === 'again') return '10 min'
  const d = next.intervalDays
  if (d < 1.5) return '1 día'
  if (d < 30) return `${Math.round(d)} días`
  return `${Math.round(d / 30)} mes${Math.round(d / 30) === 1 ? '' : 'es'}`
}
