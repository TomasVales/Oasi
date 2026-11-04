/**
 * Contrato IPC entre el proceso main y el renderer.
 * Toda comunicación pasa por aquí: el renderer nunca toca Node directamente.
 */
import type { CalendarEvent, CheckIn, DocumentRecord, FlashcardDeck, Folder, Note, PdfAnchor, StudySession, Subject } from './models'
import type { EnergyLevel, LocalDate } from './domain'
import type { PlanResult } from './planner'
import type { BlockProgress } from './planProgress'
import type { DayTotal, StreakInfo } from './streaks'
import type { AiRunInput, BackgroundLookInput, FolderCreateInput, FolderUpdateInput, GoogleCredentialsInput } from './validation'
import type { BackgroundSettings } from './settings'
import type { AppSettings, SettingKey, ThemeName } from './settings'
import type {
  AnchorCreateInput,
  SessionFinishInput,
  SessionLogInput,
  SessionUpdateInput,
  FlashcardReviewInput,
  SessionStartInput,
  EventCreateInput,
  NoteCreateInput,
  NoteUpdateInput,
  EventRangeQuery,
  EventUpdateInput,
  SubjectCreateInput,
  SubjectListQuery,
  SubjectUpdateInput,
  UpcomingQuery
} from './validation'

export const IpcChannel = {
  AppInfo: 'app:info',
  TrayUpdate: 'tray:update',

  SubjectsList: 'subjects:list',
  SubjectsCreate: 'subjects:create',
  SubjectsUpdate: 'subjects:update',
  SubjectsRemove: 'subjects:remove',

  EventsRange: 'events:range',
  EventsUpcoming: 'events:upcoming',
  EventsCreate: 'events:create',
  EventsUpdate: 'events:update',
  EventsRemove: 'events:remove',

  BackgroundChoose: 'background:choose',
  BackgroundImport: 'background:import',
  BackgroundRead: 'background:read',
  BackgroundSetLook: 'background:setLook',
  BackgroundClear: 'background:clear',

  FoldersList: 'folders:list',
  FoldersCreate: 'folders:create',
  FoldersUpdate: 'folders:update',
  FoldersRemove: 'folders:remove',
  DocumentsMove: 'documents:move',
  NotesMove: 'notes:move',
  NotesExportMarkdown: 'notes:exportMarkdown',
  NotesExportPdf: 'notes:exportPdf',
  RevealExport: 'export:reveal',

  DocumentsList: 'documents:list',
  DocumentsGet: 'documents:get',
  DocumentsImport: 'documents:import',
  DocumentsImportDialog: 'documents:importDialog',
  DocumentsRead: 'documents:read',
  DocumentsTrackPage: 'documents:trackPage',
  DocumentsRename: 'documents:rename',
  DocumentsRemove: 'documents:remove',

  NotesList: 'notes:list',
  NotesGet: 'notes:get',
  NotesCreate: 'notes:create',
  NotesUpdate: 'notes:update',
  NotesRemove: 'notes:remove',

  AnchorsCreate: 'anchors:create',
  AnchorsGet: 'anchors:get',
  AnchorsListByDocument: 'anchors:listByDocument',

  CheckInsToday: 'checkIns:today',
  CheckInsCreate: 'checkIns:create',

  SessionsStart: 'sessions:start',
  SessionsHeartbeat: 'sessions:heartbeat',
  SessionsFinish: 'sessions:finish',
  SessionsActive: 'sessions:active',
  SessionsLog: 'sessions:log',
  SessionsUpdate: 'sessions:update',
  SessionsRemove: 'sessions:remove',
  SessionsList: 'sessions:list',
  FlashcardsDeck: 'flashcards:deck',
  FlashcardsReview: 'flashcards:review',

  StatsRange: 'stats:range',
  StatsStreak: 'stats:streak',

  PlannerSuggest: 'planner:suggest',
  PlannerToday: 'planner:today',
  PlannerRecalculate: 'planner:recalculate',

  AiStatus: 'ai:status',
  AiSetKey: 'ai:setKey',
  AiListOllamaModels: 'ai:listOllamaModels',
  AiRun: 'ai:run',
  AiCancel: 'ai:cancel',

  GoogleStatus: 'google:status',
  GoogleSaveCredentials: 'google:saveCredentials',
  GoogleConnect: 'google:connect',
  GoogleDisconnect: 'google:disconnect',
  GoogleListCalendars: 'google:listCalendars',
  GoogleSetCalendars: 'google:setCalendars',
  GoogleSync: 'google:sync',

  SettingsGetAll: 'settings:getAll',
  SettingsSet: 'settings:set'
} as const

export interface ImportResult {
  document: DocumentRecord
  duplicate: boolean
}

export interface ImportFailure {
  fileName: string
  error: string
}

export interface SubjectTotal {
  subjectId: string | null
  name: string | null
  color: string | null
  seconds: number
}

export interface StatsRange {
  daily: DayTotal[]
  bySubject: SubjectTotal[]
}

export interface PlanResponse extends PlanResult {
  energy: EnergyLevel
  urgentSubjectId: string | null
  fromCheckIn: boolean
  /** Estado de cada bloque (solo en el plan guardado de hoy). */
  progress?: BlockProgress[]
  /** Bloques y minutos atrasados respecto del plan guardado. */
  behind?: { blocks: number; minutes: number }
  snapshot?: { reason: 'checkin' | 'auto' | 'panic'; createdAt: Date }
}

/** Eventos que el main empuja al renderer (no son invoke). */
export const PushChannel = {
  AiEvent: 'push:ai',
  DataChanged: 'push:dataChanged',
  Away: 'push:away',
  TrayCommand: 'push:trayCommand'
} as const

/** Estado del cronómetro para la barra de menú (null = sin sesión: se quita). */
export interface TrayState {
  remaining: string
  label: string
  subject: string
  running: boolean
  phase: 'focus' | 'break' | 'done'
}

export type TrayCommand = 'toggle' | 'skip' | 'stop' | 'focus' | 'plus5'

export interface AwayEvent {
  /** Segundos de inactividad al detectarse (se descuentan del cronómetro). */
  idleSeconds: number
  reason: 'idle' | 'lock'
}

export type AiEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done'; text: string; model: string }
  | { requestId: string; type: 'error'; message: string; kind: string }

export interface AiStatus {
  provider: 'none' | 'anthropic' | 'ollama'
  configured: boolean
  model: string
  hasApiKey: boolean
}

export interface GoogleStatus {
  hasCredentials: boolean
  connected: boolean
  clientId: string
  calendarIds: string[]
  lastSyncAt: number | null
  lastSyncError: string | null
}

export interface GoogleCalendarInfo {
  id: string
  summary: string
  primary?: boolean
  backgroundColor?: string
}

export interface SyncResult {
  upserted: number
  removed: number
  calendars: number
}

export type DataScope = 'events'

export interface AppInfo {
  name: string
  version: string
  platform: string
  userDataPath: string
  dbPath: string
}

/** API expuesta en `window.studentOS` por el preload. */
export interface StudentOSApi {
  app: {
    getInfo: () => Promise<AppInfo>
    /** Tema guardado, disponible de forma síncrona para pintar el primer frame sin parpadeo. */
    initialTheme: ThemeName
    platform: string
  }
  subjects: {
    list: (q?: SubjectListQuery) => Promise<Subject[]>
    create: (input: SubjectCreateInput) => Promise<Subject>
    update: (id: string, patch: SubjectUpdateInput) => Promise<Subject>
    remove: (id: string) => Promise<void>
  }
  events: {
    listRange: (q: EventRangeQuery) => Promise<CalendarEvent[]>
    upcoming: (q?: UpcomingQuery) => Promise<CalendarEvent[]>
    create: (input: EventCreateInput) => Promise<CalendarEvent>
    update: (id: string, patch: EventUpdateInput) => Promise<CalendarEvent>
    remove: (id: string) => Promise<void>
  }
  background: {
    /** Diálogo para elegir imagen o GIF; devuelve la configuración nueva (o null si se canceló). */
    choose: () => Promise<BackgroundSettings | null>
    /** Importa desde una ruta (p. ej. archivo soltado en la ventana). */
    import: (path: string) => Promise<BackgroundSettings>
    read: () => Promise<{ bytes: Uint8Array; mime: string } | null>
    setLook: (look: BackgroundLookInput) => Promise<BackgroundSettings>
    clear: () => Promise<BackgroundSettings>
  }
  folders: {
    list: (subjectId: string) => Promise<Folder[]>
    create: (input: FolderCreateInput) => Promise<Folder>
    update: (id: string, patch: FolderUpdateInput) => Promise<Folder>
    /** Borra la carpeta y sus subcarpetas; su contenido vuelve a la raíz de la materia. */
    remove: (id: string) => Promise<void>
  }
  documents: {
    list: (subjectId: string) => Promise<DocumentRecord[]>
    move: (id: string, folderId: string | null) => Promise<DocumentRecord>
    get: (id: string) => Promise<DocumentRecord>
    /** Importa un PDF desde una ruta absoluta (p. ej. obtenida con `pathForFile` al soltar un archivo). */
    import: (subjectId: string, sourcePath: string, folderId?: string | null) => Promise<ImportResult>
    /** Abre el diálogo nativo de archivos e importa los PDFs elegidos. */
    importDialog: (subjectId: string, folderId?: string | null) => Promise<{ imported: ImportResult[]; failed: ImportFailure[] }>
    read: (id: string) => Promise<Uint8Array>
    trackPage: (id: string, page: number) => Promise<DocumentRecord>
    rename: (id: string, title: string) => Promise<DocumentRecord>
    remove: (id: string) => Promise<void>
    /** Ruta en disco de un File soltado en la ventana (síncrono, resuelto en el preload). */
    pathForFile: (file: File) => string
  }
  notes: {
    list: (subjectId: string) => Promise<Note[]>
    move: (id: string, folderId: string | null) => Promise<Note>
    /** Diálogo "Guardar como"; devuelve la ruta o null si se canceló. */
    exportMarkdown: (noteId: string, markdown: string) => Promise<string | null>
    exportPdf: (noteId: string, html: string) => Promise<string | null>
    revealExport: (path: string) => Promise<boolean>
    get: (id: string) => Promise<Note>
    create: (input: NoteCreateInput) => Promise<Note>
    update: (id: string, patch: NoteUpdateInput) => Promise<Note>
    remove: (id: string) => Promise<void>
  }
  anchors: {
    create: (input: AnchorCreateInput) => Promise<PdfAnchor>
    get: (id: string) => Promise<PdfAnchor>
    listByDocument: (documentId: string) => Promise<PdfAnchor[]>
  }
  checkIns: {
    today: () => Promise<CheckIn | null>
    create: (input: { energy: EnergyLevel; urgentSubjectId: string | null }) => Promise<CheckIn>
  }
  sessions: {
    start: (input: SessionStartInput) => Promise<StudySession>
    heartbeat: (id: string, activeSeconds: number) => Promise<void>
    finish: (id: string, data: SessionFinishInput) => Promise<StudySession>
    active: () => Promise<StudySession | null>
    /** Registra estudio hecho sin la app abierta. */
    log: (input: SessionLogInput) => Promise<StudySession>
    /** Corregir una sesión cerrada o guardarle la reflexión final (foco, página). */
    update: (id: string, patch: SessionUpdateInput) => Promise<StudySession>
    remove: (id: string) => Promise<void>
    /** Sesiones cerradas entre dos días locales (inclusive), más recientes primero. */
    list: (from: LocalDate, to: LocalDate) => Promise<StudySession[]>
  }
  flashcards: {
    /** Tarjetas de los apuntes (opcionalmente de una materia) y cuáles tocan ahora. */
    deck: (subjectId?: string | null) => Promise<FlashcardDeck>
    review: (input: FlashcardReviewInput) => Promise<void>
  }
  stats: {
    /** Totales por día y por materia entre dos días locales (inclusive). */
    range: (from: LocalDate, to: LocalDate, subjectId?: string | null) => Promise<StatsRange>
    streak: () => Promise<StreakInfo>
  }
  planner: {
    /** Sin argumentos usa el check-in de hoy. */
    suggest: (opts?: { energy?: EnergyLevel; urgentSubjectId?: string | null; at?: Date }) => Promise<PlanResponse>
    /** Plan guardado de hoy, con el estado de cada bloque (hecho / atrasado / …). */
    today: () => Promise<PlanResponse>
    /** "Me atrasé": rearma el resto del día desde ahora. */
    recalculate: (opts: { energy?: EnergyLevel; recover: boolean }) => Promise<PlanResponse>
  }
  ai: {
    status: () => Promise<AiStatus>
    /** Guarda (cifrada) o borra (null) la API key de Anthropic. */
    setApiKey: (key: string | null) => Promise<AiStatus>
    listOllamaModels: (url: string) => Promise<string[]>
    /** Corre una tarea con streaming. `onDelta` recibe el texto a medida que llega. */
    run: (input: AiRunInput, onDelta: (text: string) => void) => { requestId: string; done: Promise<{ text: string; model: string }> }
    cancel: (requestId: string) => Promise<void>
  }
  google: {
    status: () => Promise<GoogleStatus>
    saveCredentials: (input: GoogleCredentialsInput) => Promise<GoogleStatus>
    connect: () => Promise<GoogleStatus>
    disconnect: () => Promise<GoogleStatus>
    listCalendars: () => Promise<GoogleCalendarInfo[]>
    setCalendars: (ids: string[]) => Promise<GoogleStatus>
    sync: () => Promise<SyncResult>
  }
  /** Avisos del main cuando cambian datos por detrás (p. ej. sincronización con Google). */
  onDataChanged: (cb: (scope: DataScope) => void) => () => void
  /** Modo ausente: el usuario dejó de usar la computadora o bloqueó la pantalla. */
  onAway: (cb: (e: AwayEvent) => void) => () => void
  /** Contador en la barra de menú. */
  tray: {
    update: (state: TrayState | null) => void
    onCommand: (cb: (cmd: TrayCommand) => void) => () => void
  }
  settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<void>
  }
}
