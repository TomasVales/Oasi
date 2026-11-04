import { BrowserWindow, dialog, ipcMain } from 'electron'
import { PushChannel } from '@shared/ipc'
import { basename } from 'node:path'
import { z } from 'zod'
import { IpcChannel, type ImportFailure, type ImportResult } from '@shared/ipc'
import type { SettingKey } from '@shared/settings'
import {
  backgroundLookSchema,
  exportMarkdownSchema,
  exportPdfSchema,
  folderCreateSchema,
  folderUpdateSchema,
  aiKeySchema,
  aiRunSchema,
  calendarIdsSchema,
  googleCredentialsSchema,
  checkInCreateSchema,
  localDateSchema,
  planRequestSchema,
  secondsSchema,
  sessionFinishSchema,
  sessionLogSchema,
  sessionUpdateSchema,
  sessionStartSchema,
  anchorCreateSchema,
  documentImportSchema,
  eventCreateSchema,
  noteCreateSchema,
  noteUpdateSchema,
  pageSchema,
  eventRangeSchema,
  eventUpdateSchema,
  idSchema,
  settingsSchemas,
  subjectCreateSchema,
  subjectListSchema,
  subjectUpdateSchema,
  upcomingSchema
} from '@shared/validation'
import type { Repositories } from './db/repositories'
import type { Library } from './library'
import { buildPlan, recalculatePlan, streakInfo, todayPlan } from './planning'
import { now as clockNow } from './clock'
import { buildMarkdownExport, buildPrintHtml, htmlToPdf, resolveAnchorLinks, revealExport, safeFileName, saveExport } from './export'
import type { AiService } from './ai/service'
import { listOllamaModels } from './ai/providers'
import type { GoogleService } from './google/service'
import type { SecretStore } from './secrets'
import type { BackgroundStore } from './backgrounds'
import { toLocalDate } from '@shared/domain'

type Schemas = readonly z.ZodType[]
type Parsed<S extends Schemas> = { [I in keyof S]: z.output<S[I]> }

/**
 * Registra un handler que valida cada argumento con zod antes de tocar la DB.
 * Si la validación falla, el renderer recibe un error legible y nada se ejecuta.
 */
function handle<const S extends Schemas>(channel: string, schemas: S, fn: (...args: Parsed<S>) => unknown) {
  ipcMain.handle(channel, (_e, ...raw: unknown[]) => {
    const args = schemas.map((s, i) => {
      const r = s.safeParse(raw[i])
      if (!r.success) throw new Error(`[${channel}] argumento ${i} inválido: ${z.prettifyError(r.error)}`)
      return r.data
    }) as Parsed<S>
    return fn(...args)
  })
}

const settingKeySchema = z.enum(Object.keys(settingsSchemas) as [SettingKey, ...SettingKey[]])

export interface DataHandlerHooks {
  onSettingChanged?: (key: SettingKey, value: unknown) => void
}

export interface Services {
  repos: Repositories
  library: Library
  ai: AiService
  google: GoogleService
  secrets: SecretStore
  backgrounds: BackgroundStore
}

/** Avisa a todas las ventanas que cambió un conjunto de datos. */
export function broadcastDataChanged(scope: 'events') {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(PushChannel.DataChanged, scope)
}

export function registerDataHandlers({ repos, library, ai, google, secrets, backgrounds }: Services, hooks: DataHandlerHooks = {}): void {
  // Materias
  handle(IpcChannel.SubjectsList, [subjectListSchema], (q) => repos.subjects.list(q))
  handle(IpcChannel.SubjectsCreate, [subjectCreateSchema], (input) => repos.subjects.create(input))
  handle(IpcChannel.SubjectsUpdate, [idSchema, subjectUpdateSchema], (id, patch) => repos.subjects.update(id, patch))
  handle(IpcChannel.SubjectsRemove, [idSchema], async (id) => {
    repos.subjects.remove(id) // cascada en DB: documentos, apuntes, anclas, eventos
    await library.removeSubjectFiles(id)
  })

  // Eventos
  handle(IpcChannel.EventsRange, [eventRangeSchema], (q) => repos.events.listRange(q))
  handle(IpcChannel.EventsUpcoming, [upcomingSchema], (q) => repos.events.upcoming(q))
  handle(IpcChannel.EventsCreate, [eventCreateSchema], (input) => repos.events.create(input))
  handle(IpcChannel.EventsUpdate, [idSchema, eventUpdateSchema], (id, patch) => repos.events.update(id, patch))
  handle(IpcChannel.EventsRemove, [idSchema], (id) => repos.events.remove(id))

  // Fondo personalizado
  const setBackground = (patch: Partial<ReturnType<typeof repos.settings.get<'background'>>>) => {
    const next = { ...repos.settings.get('background'), ...patch }
    repos.settings.set('background', next)
    return next
  }
  const importBackground = async (path: string) => {
    const stored = await backgrounds.import(path)
    return setBackground({ fileName: stored.fileName, mime: stored.mime })
  }
  ipcMain.handle(IpcChannel.BackgroundChoose, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Elegir fondo',
      buttonLabel: 'Usar como fondo',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes y GIF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || !r.filePaths[0]) return null
    return importBackground(r.filePaths[0])
  })
  handle(IpcChannel.BackgroundImport, [z.string().min(1).max(4096)], (path) => importBackground(path))
  handle(IpcChannel.BackgroundRead, [], async () => {
    const bg = repos.settings.get('background')
    if (!bg.fileName || !bg.mime) return null
    try {
      return { bytes: await backgrounds.read(bg.fileName), mime: bg.mime }
    } catch {
      setBackground({ fileName: null, mime: null }) // el archivo ya no está: se olvida
      return null
    }
  })
  handle(IpcChannel.BackgroundSetLook, [backgroundLookSchema], (look) => setBackground(look))
  handle(IpcChannel.BackgroundClear, [], async () => {
    await backgrounds.clear()
    return setBackground({ fileName: null, mime: null })
  })

  // Carpetas
  handle(IpcChannel.FoldersList, [idSchema], (subjectId) => repos.folders.listBySubject(subjectId))
  handle(IpcChannel.FoldersCreate, [folderCreateSchema], (input) => repos.folders.create(input))
  handle(IpcChannel.FoldersUpdate, [idSchema, folderUpdateSchema], (id, patch) => repos.folders.update(id, patch))
  handle(IpcChannel.FoldersRemove, [idSchema], (id) => repos.folders.remove(id))
  handle(IpcChannel.DocumentsMove, [idSchema, idSchema.nullable()], (id, folderId) => {
    repos.folders.assertInSubject(folderId, repos.documents.get(id).subjectId)
    return repos.documents.move(id, folderId)
  })
  handle(IpcChannel.NotesMove, [idSchema, idSchema.nullable()], (id, folderId) => {
    repos.folders.assertInSubject(folderId, repos.notes.get(id).subjectId)
    return repos.notes.move(id, folderId)
  })

  // Exportar apuntes
  const noteMeta = (noteId: string) => {
    const note = repos.notes.get(noteId)
    const subject = repos.subjects.get(note.subjectId)
    return { note, subjectName: subject.name }
  }
  ipcMain.handle(IpcChannel.NotesExportMarkdown, async (e, raw: unknown) => {
    const { noteId, markdown } = exportMarkdownSchema.parse(raw)
    const { note, subjectName } = noteMeta(noteId)
    const content = buildMarkdownExport({ title: note.title, content: resolveAnchorLinks(markdown, repos) }, subjectName)
    return saveExport(BrowserWindow.fromWebContents(e.sender), safeFileName(note.title), 'md', content)
  })
  ipcMain.handle(IpcChannel.NotesExportPdf, async (e, raw: unknown) => {
    const { noteId, html } = exportPdfSchema.parse(raw)
    const { note, subjectName } = noteMeta(noteId)
    const meta = [subjectName, new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })].join(' · ')
    const doc = await buildPrintHtml(html, note.title, meta)
    const pdf = await htmlToPdf(doc.html, doc.baseDir)
    return saveExport(BrowserWindow.fromWebContents(e.sender), safeFileName(note.title), 'pdf', pdf)
  })
  handle(IpcChannel.RevealExport, [z.string().min(1)], (path) => revealExport(path))

  // Documentos (PDF)
  handle(IpcChannel.DocumentsList, [idSchema], (subjectId) => repos.documents.listBySubject(subjectId))
  handle(IpcChannel.DocumentsGet, [idSchema], (id) => repos.documents.get(id))
  handle(
    IpcChannel.DocumentsImport,
    [documentImportSchema.shape.subjectId, documentImportSchema.shape.sourcePath, idSchema.nullish()],
    (subjectId, path, folderId) => library.importPdf(subjectId, path, folderId ?? null)
  )
  handle(IpcChannel.DocumentsRead, [idSchema], (id) => library.read(id))
  handle(IpcChannel.DocumentsTrackPage, [idSchema, pageSchema], (id, page) => repos.documents.trackPage(id, page))
  handle(IpcChannel.DocumentsRename, [idSchema, z.string().trim().min(1).max(200)], (id, title) =>
    repos.documents.rename(id, title)
  )
  handle(IpcChannel.DocumentsRemove, [idSchema], (id) => library.removeDocument(id))

  ipcMain.handle(IpcChannel.DocumentsImportDialog, async (e, rawSubjectId: unknown, rawFolderId: unknown) => {
    const subjectId = idSchema.parse(rawSubjectId)
    const folderId = idSchema.nullish().parse(rawFolderId) ?? null
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Importar PDFs',
      buttonLabel: 'Importar',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const imported: ImportResult[] = []
    const failed: ImportFailure[] = []
    if (canceled) return { imported, failed }
    for (const path of filePaths) {
      try {
        imported.push(await library.importPdf(subjectId, path, folderId))
      } catch (err) {
        failed.push({ fileName: basename(path), error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { imported, failed }
  })

  // Apuntes
  handle(IpcChannel.NotesList, [idSchema], (subjectId) => repos.notes.listBySubject(subjectId))
  handle(IpcChannel.NotesGet, [idSchema], (id) => repos.notes.get(id))
  handle(IpcChannel.NotesCreate, [noteCreateSchema], (input) => {
    repos.folders.assertInSubject(input.folderId, input.subjectId)
    return repos.notes.create(input)
  })
  handle(IpcChannel.NotesUpdate, [idSchema, noteUpdateSchema], (id, patch) => repos.notes.update(id, patch))
  handle(IpcChannel.NotesRemove, [idSchema], (id) => repos.notes.remove(id))

  // Anclas (deep links)
  handle(IpcChannel.AnchorsCreate, [anchorCreateSchema], (input) => {
    repos.documents.get(input.documentId) // valida que exista
    return repos.anchors.create(input)
  })
  handle(IpcChannel.AnchorsGet, [idSchema], (id) => repos.anchors.get(id))
  handle(IpcChannel.AnchorsListByDocument, [idSchema], (documentId) => repos.anchors.listByDocument(documentId))

  // Check-in de energía
  handle(IpcChannel.CheckInsToday, [], () => repos.checkIns.latestForDay(toLocalDate()) ?? null)
  handle(IpcChannel.CheckInsCreate, [checkInCreateSchema], (input) => {
    if (input.urgentSubjectId) repos.subjects.get(input.urgentSubjectId)
    return repos.checkIns.create(input)
  })

  // Sesiones de estudio (cronómetro)
  handle(IpcChannel.SessionsStart, [sessionStartSchema], (input) => repos.sessions.start(input))
  handle(IpcChannel.SessionsHeartbeat, [idSchema, secondsSchema], (id, s) => repos.sessions.heartbeat(id, s))
  handle(IpcChannel.SessionsFinish, [idSchema, sessionFinishSchema], (id, data) => repos.sessions.finish(id, data))
  handle(IpcChannel.SessionsActive, [], () => repos.sessions.active() ?? null)
  handle(IpcChannel.SessionsUpdate, [idSchema, sessionUpdateSchema], (id, patch) => {
    if (patch.subjectId) repos.subjects.get(patch.subjectId)
    if (repos.sessions.active()?.id === id && patch.activeSeconds !== undefined)
      throw new Error('No se puede editar el tiempo de la sesión en curso')
    return repos.sessions.update(id, patch)
  })
  handle(IpcChannel.SessionsRemove, [idSchema], (id) => repos.sessions.remove(id))
  handle(IpcChannel.SessionsList, [localDateSchema, localDateSchema], (from, to) => repos.sessions.listRange(from, to))
  handle(IpcChannel.SessionsLog, [sessionLogSchema], (input) => {
    const now = Date.now()
    if (input.endedAt > now + 60_000) throw new Error('No se puede registrar estudio en el futuro')
    if (input.endedAt - input.minutes * 60_000 < now - 30 * 86_400_000) throw new Error('Solo se puede registrar estudio de los últimos 30 días')
    if (input.subjectId) repos.subjects.get(input.subjectId) // valida que exista
    return repos.sessions.log({ subjectId: input.subjectId ?? null, minutes: input.minutes, endedAt: new Date(input.endedAt) })
  })

  // Estadísticas
  handle(IpcChannel.StatsRange, [localDateSchema, localDateSchema, idSchema.nullish()], (from, to, subjectId) => ({
    daily: repos.sessions.dailyTotals(from, to, subjectId),
    bySubject: repos.sessions.totalsBySubject(from, to)
  }))
  handle(IpcChannel.StatsStreak, [], () => streakInfo(repos))

  // Planificador
  handle(IpcChannel.PlannerSuggest, [planRequestSchema], (req) => buildPlan(repos, req ?? {}, clockNow()))
  handle(IpcChannel.PlannerToday, [], () => todayPlan(repos, clockNow()))
  handle(
    IpcChannel.PlannerRecalculate,
    [z.object({ energy: z.enum(['low', 'medium', 'high']).optional(), recover: z.boolean() })],
    (req) => recalculatePlan(repos, req, clockNow())
  )

  // IA (las credenciales nunca vuelven al renderer)
  handle(IpcChannel.AiStatus, [], () => ai.status())
  handle(IpcChannel.AiSetKey, [aiKeySchema.nullable()], (key) => {
    if (key) secrets.set('anthropic.apiKey', key)
    else secrets.delete('anthropic.apiKey')
    return ai.status()
  })
  handle(IpcChannel.AiListOllamaModels, [z.url({ protocol: /^https?$/ })], (url) => listOllamaModels(url))
  ipcMain.handle(IpcChannel.AiRun, (e, rawId: unknown, rawInput: unknown) => {
    const requestId = z.uuid().parse(rawId)
    const input = aiRunSchema.parse(rawInput)
    const sender = e.sender
    // No se espera: la respuesta viaja por eventos de streaming.
    void ai.run(requestId, input, (ev) => {
      if (!sender.isDestroyed()) sender.send(PushChannel.AiEvent, ev)
    })
  })
  handle(IpcChannel.AiCancel, [z.string()], (id) => ai.cancel(id))

  // Google Calendar (solo lectura)
  handle(IpcChannel.GoogleStatus, [], () => google.status())
  handle(IpcChannel.GoogleSaveCredentials, [googleCredentialsSchema], (c) => {
    google.saveCredentials(c.clientId, c.clientSecret)
    return google.status()
  })
  handle(IpcChannel.GoogleConnect, [], () => google.connect())
  handle(IpcChannel.GoogleDisconnect, [], async () => {
    await google.disconnect()
    broadcastDataChanged('events')
    return google.status()
  })
  handle(IpcChannel.GoogleListCalendars, [], async () =>
    (await google.listCalendars()).map(({ id, summary, primary, backgroundColor }) => ({ id, summary, primary, backgroundColor }))
  )
  handle(IpcChannel.GoogleSetCalendars, [calendarIdsSchema], async (ids) => {
    google.setCalendars(ids)
    await google.sync().catch(() => {})
    broadcastDataChanged('events')
    return google.status()
  })
  handle(IpcChannel.GoogleSync, [], async () => {
    const r = await google.sync()
    broadcastDataChanged('events')
    return r
  })

  // Preferencias: el valor se valida con el esquema específico de cada clave.
  handle(IpcChannel.SettingsGetAll, [], () => repos.settings.getAll())
  handle(IpcChannel.SettingsSet, [settingKeySchema, z.unknown()], (key, value) => {
    const parsed = settingsSchemas[key].parse(value)
    repos.settings.set(key, parsed as never)
    hooks.onSettingChanged?.(key, parsed)
  })
}

