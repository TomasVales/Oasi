import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import {
  ANCHOR_KINDS,
  ENERGY_LEVELS,
  EVENT_KINDS,
  EVENT_SOURCES,
  type NormalizedRect
} from '../../shared/domain'
import type { SnapshotBlock } from '../../shared/planProgress'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
    .$onUpdateFn(() => new Date())

// ─── Materias ────────────────────────────────────────────────────────────────
export const subjects = sqliteTable('subjects', {
  id: id(),
  name: text('name').notNull(),
  code: text('code'),
  color: text('color').notNull().default('#6366f1'),
  /** 1–5. Carga cognitiva base de la materia; la usa el planificador para cruzar con la energía. */
  difficulty: integer('difficulty').notNull().default(3),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

// ─── Eventos: clases, parciales, entregas ────────────────────────────────────
export const events = sqliteTable(
  'events',
  {
    id: id(),
    subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: EVENT_KINDS }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    /** 1–5. Peso del hito (un final pesa más que un TP). Prioriza en el planificador. */
    weight: integer('weight').notNull().default(3),
    source: text('source', { enum: EVENT_SOURCES }).notNull().default('manual'),
    /** ID del evento en Google Calendar; junto con `source` permite sincronizar sin duplicar. */
    externalId: text('external_id'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index('events_starts_at_idx').on(t.startsAt),
    index('events_subject_idx').on(t.subjectId),
    uniqueIndex('events_external_uq').on(t.source, t.externalId)
  ]
)

// ─── Carpetas dentro de cada materia (anidables, con emoji) ──────────────────
export const folders = sqliteTable(
  'folders',
  {
    id: id(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** null = carpeta en la raíz de la materia. */
    parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    emoji: text('emoji').notNull().default('📁'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt()
  },
  (t) => [index('folders_subject_idx').on(t.subjectId), index('folders_parent_idx').on(t.parentId)]
)

// ─── Documentos (PDFs guardados localmente por materia) ──────────────────────
export const documents = sqliteTable(
  'documents',
  {
    id: id(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Carpeta dentro de la materia; null = raíz. Al borrar la carpeta, vuelve a la raíz. */
    folderId: text('folder_id').references((): AnySQLiteColumn => folders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    originalName: text('original_name').notNull(),
    /** Ruta relativa a la biblioteca local (userData/library). Nunca absoluta: la app es portable. */
    storagePath: text('storage_path').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    pageCount: integer('page_count').notNull(),
    /** Última página abierta, para retomar donde se dejó. */
    lastPage: integer('last_page').notNull().default(1),
    /** Página más alta alcanzada: alimenta la distribución de carga (páginas restantes). */
    maxPageRead: integer('max_page_read').notNull().default(0),
    lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index('documents_subject_idx').on(t.subjectId),
    uniqueIndex('documents_subject_hash_uq').on(t.subjectId, t.sha256)
  ]
)

// ─── Apuntes (Markdown) ──────────────────────────────────────────────────────
export const notes = sqliteTable(
  'notes',
  {
    id: id(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references((): AnySQLiteColumn => folders.id, { onDelete: 'set null' }),
    /** Documento con el que se abre en split-screen por defecto. */
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Sin título'),
    /** Markdown. Los deep links se serializan como [texto](studentos://anchor/<anchorId>). */
    content: text('content').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index('notes_subject_idx').on(t.subjectId),
    index('notes_document_idx').on(t.documentId)
  ]
)

// ─── Anclas de PDF (destino de los deep links) ───────────────────────────────
export const pdfAnchors = sqliteTable(
  'pdf_anchors',
  {
    id: id(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** Apunte donde se creó el link (backlinks: "¿qué apuntes citan esta página?"). */
    noteId: text('note_id').references(() => notes.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ANCHOR_KINDS }).notNull(),
    page: integer('page').notNull(),
    /** Uno o más rectángulos normalizados (una selección de texto puede ocupar varias líneas). */
    rects: text('rects', { mode: 'json' }).$type<NormalizedRect[]>().notNull(),
    selectedText: text('selected_text'),
    createdAt: createdAt()
  },
  (t) => [
    index('anchors_document_idx').on(t.documentId),
    index('anchors_note_idx').on(t.noteId)
  ]
)

// ─── Check-ins de energía ────────────────────────────────────────────────────
export const checkIns = sqliteTable(
  'check_ins',
  {
    id: id(),
    localDate: text('local_date').notNull(),
    energy: text('energy', { enum: ENERGY_LEVELS }).notNull(),
    urgentSubjectId: text('urgent_subject_id').references(() => subjects.id, {
      onDelete: 'set null'
    }),
    createdAt: createdAt()
  },
  (t) => [index('check_ins_date_idx').on(t.localDate)]
)

// ─── Sesiones de estudio (cronómetro, heatmap, rachas, estadísticas) ─────────
export const studySessions = sqliteTable(
  'study_sessions',
  {
    id: id(),
    /** `set null`: borrar una materia no debe borrar días del heatmap ni la racha. */
    subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** Hito para el que se estudia (parcial/entrega), si aplica. */
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    checkInId: text('check_in_id').references(() => checkIns.id, { onDelete: 'set null' }),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    /** null = sesión en curso. */
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    /** Día LOCAL de inicio. Se guarda (no se deriva) para que el heatmap no dependa de la zona horaria. */
    localDate: text('local_date').notNull(),
    plannedSeconds: integer('planned_seconds'),
    /** Tiempo efectivo, sin pausas. Es lo que suma al heatmap y a las estadísticas. */
    activeSeconds: integer('active_seconds').notNull().default(0),
    /** 0–1, % de foco declarado al cerrar la sesión (opcional). */
    focusScore: real('focus_score'),
    pagesFrom: integer('pages_from'),
    pagesTo: integer('pages_to'),
    createdAt: createdAt()
  },
  (t) => [
    index('sessions_local_date_idx').on(t.localDate),
    index('sessions_subject_idx').on(t.subjectId)
  ]
)

// ─── Planes del día guardados (para detectar atrasos y recalcular) ──────────
export const planSnapshots = sqliteTable(
  'plan_snapshots',
  {
    id: id(),
    localDate: text('local_date').notNull(),
    /** checkin = al hacer el check-in · auto = primera vez que se pidió · panic = "me atrasé". */
    reason: text('reason', { enum: ['checkin', 'auto', 'panic'] }).notNull(),
    energy: text('energy', { enum: ENERGY_LEVELS }).notNull(),
    urgentSubjectId: text('urgent_subject_id'),
    /** Bloques serializados (fechas en ISO). */
    blocks: text('blocks', { mode: 'json' }).$type<SnapshotBlock[]>().notNull(),
    createdAt: createdAt()
  },
  (t) => [index('plan_snapshots_date_idx').on(t.localDate)]
)

// ─── Preferencias (tema, pomodoro, etc.) ─────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: updatedAt()
})
