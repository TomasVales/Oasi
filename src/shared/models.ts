/** Tipos de filas tal como llegan al renderer. Solo tipos: nada de esto se ejecuta en la UI. */
import type { InferSelectModel } from 'drizzle-orm'
import type * as schema from '../main/db/schema'

export type Subject = InferSelectModel<typeof schema.subjects>
export type CalendarEvent = InferSelectModel<typeof schema.events>
export type DocumentRecord = InferSelectModel<typeof schema.documents>
export type Note = InferSelectModel<typeof schema.notes>
export type PdfAnchor = InferSelectModel<typeof schema.pdfAnchors>
export type CheckIn = InferSelectModel<typeof schema.checkIns>
export type StudySession = InferSelectModel<typeof schema.studySessions>
export type Folder = InferSelectModel<typeof schema.folders>

/** Tarjeta de repaso armada a partir de un apunte ("pregunta :: respuesta"). */
export interface Flashcard {
  id: string
  noteId: string
  noteTitle: string
  subjectId: string
  subjectName: string
  front: string
  back: string
  isNew: boolean
  dueAt: Date
  schedule: import('./flashcards').CardSchedule
  /** Días hasta el próximo parcial de la materia; null = ninguno cargado. */
  examInDays: number | null
}

export interface FlashcardDeck {
  /** Todas las tarjetas encontradas en los apuntes. */
  total: number
  /** Las que tocan ahora, en orden de repaso. */
  due: Flashcard[]
  newCount: number
}
