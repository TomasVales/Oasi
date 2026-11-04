import { cardId, NEW_CARD, parseFlashcards, scheduleReview, type Grade } from '@shared/flashcards'
import type { Flashcard, FlashcardDeck } from '@shared/models'
import type { Repositories } from './db/repositories'

const DAY = 86_400_000

/** Días hasta el próximo parcial pendiente de cada materia (para priorizar y acortar intervalos). */
function examDays(repos: Repositories, now: Date): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of repos.events.upcoming({ kinds: ['exam'], limit: 100 }, now)) {
    if (!e.subjectId || out.has(e.subjectId)) continue
    out.set(e.subjectId, Math.max(0, Math.ceil((e.startsAt.getTime() - now.getTime()) / DAY)))
  }
  return out
}

/**
 * Todas las tarjetas de los apuntes con su estado de repaso. `due` = las que tocan ahora,
 * primero las de materias con parcial más cercano, después las más atrasadas.
 */
export function flashcardDeck(repos: Repositories, opts: { subjectId?: string | null } = {}, now = new Date()): FlashcardDeck {
  const reviews = new Map(repos.flashcards.all().map((r) => [r.id, r]))
  const exams = examDays(repos, now)
  const subjects = new Map(repos.subjects.list().map((s) => [s.id, s.name]))
  const cards: Flashcard[] = []
  for (const note of repos.notes.listAll()) {
    if (opts.subjectId && note.subjectId !== opts.subjectId) continue
    if (!subjects.has(note.subjectId)) continue // materia archivada
    for (const c of parseFlashcards(note.content)) {
      const id = cardId(note.id, c.front)
      const r = reviews.get(id)
      cards.push({
        id,
        noteId: note.id,
        noteTitle: note.title,
        subjectId: note.subjectId,
        subjectName: subjects.get(note.subjectId) ?? '',
        front: c.front,
        back: c.back,
        isNew: !r,
        dueAt: r ? r.dueAt : now,
        schedule: r ? { ease: r.ease, intervalDays: r.intervalDays, reps: r.reps, lapses: r.lapses } : NEW_CARD,
        examInDays: exams.get(note.subjectId) ?? null
      })
    }
  }
  const due = cards
    .filter((c) => c.dueAt.getTime() <= now.getTime())
    .sort((a, b) => (a.examInDays ?? 999) - (b.examInDays ?? 999) || a.dueAt.getTime() - b.dueAt.getTime())
  return { total: cards.length, due, newCount: due.filter((c) => c.isNew).length }
}

export function reviewFlashcard(repos: Repositories, input: { id: string; noteId: string; grade: Grade }, now = new Date()) {
  const note = repos.notes.get(input.noteId)
  if (!input.id.startsWith(`${note.id}:`)) throw new Error('La tarjeta no pertenece a ese apunte')
  const current = repos.flashcards.get(input.id)
  const exam = examDays(repos, now).get(note.subjectId) ?? null
  const next = scheduleReview(current ?? NEW_CARD, input.grade, now.getTime(), exam)
  return repos.flashcards.save({
    id: input.id,
    noteId: note.id,
    ease: next.ease,
    intervalDays: next.intervalDays,
    reps: next.reps,
    lapses: next.lapses,
    dueAt: new Date(next.dueAt),
    lastReviewedAt: now
  })
}
