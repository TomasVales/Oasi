/**
 * Esquemas zod para todo lo que cruza el puente IPC. El main valida SIEMPRE
 * (el renderer no es de confianza); la UI puede reusarlos en formularios.
 */
import { z } from 'zod'
import { ANCHOR_KINDS, ENERGY_LEVELS, EVENT_KINDS } from './domain'
import { AI_PROVIDERS, DASHBOARD_WIDGETS, SOUNDSCAPES, THEMES } from './settings'

export const idSchema = z.uuid()

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex #RRGGBB')
const level = z.number().int().min(1).max(5)

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(20).nullish(),
  color: hexColor.optional(),
  difficulty: level.optional()
})
export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>

export const subjectUpdateSchema = subjectCreateSchema
  .partial()
  .extend({ archived: z.boolean().optional() })
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>

export const subjectListSchema = z.object({ includeArchived: z.boolean().optional() }).optional()
export type SubjectListQuery = z.infer<typeof subjectListSchema>

const eventFields = z.object({
  subjectId: idSchema.nullish(),
  kind: z.enum(EVENT_KINDS),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(5000).nullish(),
  startsAt: z.date(),
  endsAt: z.date().nullish(),
  allDay: z.boolean().optional(),
  weight: level.optional(),
  completedAt: z.date().nullish()
})

const endsAfterStart = (e: { startsAt?: Date; endsAt?: Date | null }) =>
  !e.startsAt || !e.endsAt || e.endsAt >= e.startsAt
const endsAfterStartMsg = { message: 'endsAt debe ser posterior a startsAt', path: ['endsAt'] }

/** Eventos manuales (parciales, entregas). Los de Google entran por el sync, no por aquí. */
export const eventCreateSchema = eventFields.refine(endsAfterStart, endsAfterStartMsg)
export type EventCreateInput = z.infer<typeof eventCreateSchema>

export const eventUpdateSchema = eventFields.partial().refine(endsAfterStart, endsAfterStartMsg)
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>

export const eventRangeSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    kinds: z.array(z.enum(EVENT_KINDS)).optional(),
    subjectId: idSchema.optional()
  })
  .refine((q) => q.to >= q.from, { message: 'to debe ser posterior a from' })
export type EventRangeQuery = z.infer<typeof eventRangeSchema>

export const upcomingSchema = z
  .object({ limit: z.number().int().min(1).max(100).optional(), kinds: z.array(z.enum(EVENT_KINDS)).optional() })
  .optional()
export type UpcomingQuery = z.infer<typeof upcomingSchema>

export const settingsSchemas = {
  theme: z.enum(THEMES),
  pomodoro: z.object({
    focusMinutes: z.number().int().min(5).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(90),
    cyclesBeforeLongBreak: z.number().int().min(1).max(10)
  }),
  streakMinMinutes: z.number().int().min(1).max(600),
  ai: z.object({
    provider: z.enum(AI_PROVIDERS),
    anthropicModel: z.string().trim().min(1).max(100),
    ollamaUrl: z.url({ protocol: /^https?$/ }).max(300),
    ollamaModel: z.string().trim().max(200)
  }),
  // google: solo lo escribe el proceso main (no editable desde la UI vía settings.set)
  google: z.never(),
  profile: z.object({ name: z.string().trim().max(60) }),
  idle: z.object({ enabled: z.boolean(), minutes: z.number().int().min(1).max(120) }),
  appIcon: z.enum(['clasico', 'noche', 'neon']),
  onboarding: z.object({ completedAt: z.number().int().positive().nullable() }),
  // background: el archivo lo fija el main al importar; la UI solo cambia el "look" (IPC aparte).
  background: z.never(),
  soundscape: z.object({
    enabled: z.boolean(),
    autoplay: z.boolean(),
    pauseOnBreak: z.boolean(),
    sound: z.enum(SOUNDSCAPES),
    volume: z.number().min(0).max(1)
  }),
  dashboard: z.object({
    order: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
    hidden: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length)
  })
} as const

// ─── Documentos, apuntes y anclas ──────────────────────────────────────────
export const documentImportSchema = z.object({
  subjectId: idSchema,
  sourcePath: z.string().min(1).max(4096)
})
export type DocumentImportInput = z.infer<typeof documentImportSchema>

export const pageSchema = z.number().int().min(1).max(100_000)

export const noteCreateSchema = z.object({
  subjectId: idSchema,
  documentId: idSchema.nullish(),
  folderId: idSchema.nullish(),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(5_000_000).optional()
})
export type NoteCreateInput = z.infer<typeof noteCreateSchema>

export const noteUpdateSchema = z.object({
  documentId: idSchema.nullish(),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(5_000_000).optional()
})
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>

const unit = z.number().min(0).max(1)
export const normalizedRectSchema = z.object({ x: unit, y: unit, w: unit, h: unit })

export const anchorCreateSchema = z.object({
  documentId: idSchema,
  noteId: idSchema.nullish(),
  kind: z.enum(ANCHOR_KINDS),
  page: pageSchema,
  rects: z.array(normalizedRectSchema).min(1).max(200),
  selectedText: z.string().max(20_000).nullish()
})
export type AnchorCreateInput = z.infer<typeof anchorCreateSchema>

// ─── Check-ins, sesiones, estadísticas ─────────────────────────────────────
export const energySchema = z.enum(ENERGY_LEVELS)

export const checkInCreateSchema = z.object({ energy: energySchema, urgentSubjectId: idSchema.nullable() })

export const sessionStartSchema = z.object({
  subjectId: idSchema.nullish(),
  eventId: idSchema.nullish(),
  documentId: idSchema.nullish(),
  checkInId: idSchema.nullish(),
  plannedSeconds: z.number().int().min(60).max(12 * 3600).nullish(),
  pagesFrom: pageSchema.nullish()
})
export type SessionStartInput = z.infer<typeof sessionStartSchema>

const seconds = z.number().int().min(0).max(24 * 3600)
export const sessionFinishSchema = z.object({
  activeSeconds: seconds,
  focusScore: z.number().min(0).max(1).nullish(),
  pagesTo: pageSchema.nullish()
})
export type SessionFinishInput = z.infer<typeof sessionFinishSchema>
export const secondsSchema = seconds

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const planRequestSchema = z
  .object({ energy: energySchema.optional(), urgentSubjectId: idSchema.nullish(), at: z.date().optional() })
  .optional()

// ─── IA y Google ────────────────────────────────────────────────────────────
export const AI_TASKS = ['simplify', 'summarize', 'reading-advice'] as const
export type AiTask = (typeof AI_TASKS)[number]

export const aiRunSchema = z.object({
  task: z.enum(AI_TASKS),
  text: z.string().min(1).max(20_000),
  documentTitle: z.string().max(300).nullish(),
  subjectName: z.string().max(200).nullish(),
  page: z.number().int().min(1).nullish()
})
export type AiRunInput = z.infer<typeof aiRunSchema>

export const aiKeySchema = z.string().trim().min(10).max(500)

export const googleCredentialsSchema = z.object({
  clientId: z.string().trim().regex(/\.apps\.googleusercontent\.com$/, 'Client ID de Google inválido').max(300),
  clientSecret: z.string().trim().min(8).max(300)
})
export type GoogleCredentialsInput = z.infer<typeof googleCredentialsSchema>

export const calendarIdsSchema = z.array(z.string().min(1).max(500)).max(50)

// ─── Carpetas y exportación ────────────────────────────────────────────────
const emojiSchema = z.string().trim().min(1).max(16)
export const folderCreateSchema = z.object({
  subjectId: idSchema,
  parentId: idSchema.nullish(),
  name: z.string().trim().min(1).max(60),
  emoji: emojiSchema.optional()
})
export type FolderCreateInput = z.infer<typeof folderCreateSchema>

export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  emoji: emojiSchema.optional(),
  parentId: idSchema.nullish()
})
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>

export const exportMarkdownSchema = z.object({ noteId: idSchema, markdown: z.string().max(5_000_000) })
export const exportPdfSchema = z.object({ noteId: idSchema, html: z.string().max(20_000_000) })

const overlayValue = z.number().min(0.3).max(1)
export const backgroundLookSchema = z.object({
  overlay: z.object({ zen: overlayValue, focus: overlayValue, arcade: overlayValue }),
  blur: z.number().min(0).max(40)
})
export type BackgroundLookInput = z.infer<typeof backgroundLookSchema>
