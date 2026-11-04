import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannel as C, PushChannel, type AiEvent, type AwayEvent, type DataScope, type StudentOSApi } from '@shared/ipc'
import { isTheme, THEME_ARG_PREFIX } from '@shared/theme'

const themeArg = process.argv.find((a) => a.startsWith(THEME_ARG_PREFIX))?.slice(THEME_ARG_PREFIX.length)
const initialTheme = isTheme(themeArg) ? themeArg : 'zen'

// El preload corre antes de que exista <html>: aplicamos el tema en cuanto el parser lo crea,
// antes del primer pintado, para que no haya un destello del tema equivocado.
function applyRootAttributes(): boolean {
  const root = document.documentElement
  if (!root) return false
  root.dataset['theme'] = initialTheme
  root.dataset['platform'] = process.platform
  return true
}
if (!applyRootAttributes()) {
  const observer = new MutationObserver(() => {
    if (applyRootAttributes()) observer.disconnect()
  })
  observer.observe(document, { childList: true })
}

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: StudentOSApi = {
  app: {
    getInfo: () => invoke(C.AppInfo),
    initialTheme,
    platform: process.platform
  },
  subjects: {
    list: (q) => invoke(C.SubjectsList, q),
    create: (input) => invoke(C.SubjectsCreate, input),
    update: (id, patch) => invoke(C.SubjectsUpdate, id, patch),
    remove: (id) => invoke(C.SubjectsRemove, id)
  },
  events: {
    listRange: (q) => invoke(C.EventsRange, q),
    upcoming: (q) => invoke(C.EventsUpcoming, q),
    create: (input) => invoke(C.EventsCreate, input),
    update: (id, patch) => invoke(C.EventsUpdate, id, patch),
    remove: (id) => invoke(C.EventsRemove, id)
  },
  background: {
    choose: () => invoke(C.BackgroundChoose),
    import: (path) => invoke(C.BackgroundImport, path),
    read: () => invoke(C.BackgroundRead),
    setLook: (look) => invoke(C.BackgroundSetLook, look),
    clear: () => invoke(C.BackgroundClear)
  },
  folders: {
    list: (subjectId) => invoke(C.FoldersList, subjectId),
    create: (input) => invoke(C.FoldersCreate, input),
    update: (id, patch) => invoke(C.FoldersUpdate, id, patch),
    remove: (id) => invoke(C.FoldersRemove, id)
  },
  documents: {
    list: (subjectId) => invoke(C.DocumentsList, subjectId),
    move: (id, folderId) => invoke(C.DocumentsMove, id, folderId),
    get: (id) => invoke(C.DocumentsGet, id),
    import: (subjectId, sourcePath, folderId) => invoke(C.DocumentsImport, subjectId, sourcePath, folderId ?? null),
    importDialog: (subjectId, folderId) => invoke(C.DocumentsImportDialog, subjectId, folderId ?? null),
    read: (id) => invoke(C.DocumentsRead, id),
    trackPage: (id, page) => invoke(C.DocumentsTrackPage, id, page),
    rename: (id, title) => invoke(C.DocumentsRename, id, title),
    remove: (id) => invoke(C.DocumentsRemove, id),
    pathForFile: (file) => webUtils.getPathForFile(file)
  },
  notes: {
    list: (subjectId) => invoke(C.NotesList, subjectId),
    move: (id, folderId) => invoke(C.NotesMove, id, folderId),
    exportMarkdown: (noteId, markdown) => invoke(C.NotesExportMarkdown, { noteId, markdown }),
    exportPdf: (noteId, html) => invoke(C.NotesExportPdf, { noteId, html }),
    revealExport: (path) => invoke(C.RevealExport, path),
    get: (id) => invoke(C.NotesGet, id),
    create: (input) => invoke(C.NotesCreate, input),
    update: (id, patch) => invoke(C.NotesUpdate, id, patch),
    remove: (id) => invoke(C.NotesRemove, id)
  },
  anchors: {
    create: (input) => invoke(C.AnchorsCreate, input),
    get: (id) => invoke(C.AnchorsGet, id),
    listByDocument: (documentId) => invoke(C.AnchorsListByDocument, documentId)
  },
  checkIns: {
    today: () => invoke(C.CheckInsToday),
    create: (input) => invoke(C.CheckInsCreate, input)
  },
  sessions: {
    start: (input) => invoke(C.SessionsStart, input),
    heartbeat: (id, s) => invoke(C.SessionsHeartbeat, id, s),
    finish: (id, data) => invoke(C.SessionsFinish, id, data),
    active: () => invoke(C.SessionsActive),
    log: (input) => invoke(C.SessionsLog, input),
    update: (id, patch) => invoke(C.SessionsUpdate, id, patch),
    remove: (id) => invoke(C.SessionsRemove, id),
    list: (from, to) => invoke(C.SessionsList, from, to)
  },
  stats: {
    range: (from, to, subjectId) => invoke(C.StatsRange, from, to, subjectId),
    streak: () => invoke(C.StatsStreak)
  },
  planner: {
    suggest: (opts) => invoke(C.PlannerSuggest, opts),
    today: () => invoke(C.PlannerToday),
    recalculate: (opts) => invoke(C.PlannerRecalculate, opts)
  },
  ai: {
    status: () => invoke(C.AiStatus),
    setApiKey: (key) => invoke(C.AiSetKey, key),
    listOllamaModels: (url) => invoke(C.AiListOllamaModels, url),
    run: (input, onDelta) => {
      const requestId = crypto.randomUUID()
      const done = new Promise<{ text: string; model: string }>((resolve, reject) => {
        const listener = (_e: Electron.IpcRendererEvent, ev: AiEvent) => {
          if (ev.requestId !== requestId) return
          if (ev.type === 'delta') return onDelta(ev.text)
          ipcRenderer.removeListener(PushChannel.AiEvent, listener)
          if (ev.type === 'done') resolve({ text: ev.text, model: ev.model })
          else reject(new Error(ev.message))
        }
        ipcRenderer.on(PushChannel.AiEvent, listener)
        invoke(C.AiRun, requestId, input).catch((err) => {
          ipcRenderer.removeListener(PushChannel.AiEvent, listener)
          reject(err)
        })
      })
      return { requestId, done }
    },
    cancel: (requestId) => invoke(C.AiCancel, requestId)
  },
  google: {
    status: () => invoke(C.GoogleStatus),
    saveCredentials: (input) => invoke(C.GoogleSaveCredentials, input),
    connect: () => invoke(C.GoogleConnect),
    disconnect: () => invoke(C.GoogleDisconnect),
    listCalendars: () => invoke(C.GoogleListCalendars),
    setCalendars: (ids) => invoke(C.GoogleSetCalendars, ids),
    sync: () => invoke(C.GoogleSync)
  },
  onDataChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, scope: DataScope) => cb(scope)
    ipcRenderer.on(PushChannel.DataChanged, listener)
    return () => ipcRenderer.removeListener(PushChannel.DataChanged, listener)
  },
  onAway: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: AwayEvent) => cb(ev)
    ipcRenderer.on(PushChannel.Away, listener)
    return () => ipcRenderer.removeListener(PushChannel.Away, listener)
  },
  settings: {
    getAll: () => invoke(C.SettingsGetAll),
    set: (key, value) => invoke(C.SettingsSet, key, value)
  }
}

contextBridge.exposeInMainWorld('studentOS', api)
