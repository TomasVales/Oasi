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
