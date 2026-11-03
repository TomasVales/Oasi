import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast as toastMotion } from '@/lib/motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { Bot, FilePlus2, FileText, Library, Loader2, NotebookPen, Plus, Upload, X } from 'lucide-react'
import type { AiTask } from '@shared/validation'
import { AssistantPanel, TASK_LABEL, type AiItem } from '@/features/assistant/AssistantPanel'
import type { DocumentRecord, Note, PdfAnchor } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useSubjects } from '@/hooks/useSubjects'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import type { AnchorDraft } from './anchorDraft'
import { NoteEditor, type NoteEditorHandle } from './editor/NoteEditor'
import { PdfViewer, type FocusRequest } from './pdf/PdfViewer'
import { useDebouncedCallback } from './useDebouncedCallback'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function WorkspacePage() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [split, setSplit] = usePersistentState('workspace.split', 0.55)
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string; action?: { label: string; run: () => void } } | null>(null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [importing, setImporting] = useState(false)
  const editorRef = useRef<NoteEditorHandle>(null)
  const [assistant, setAssistant] = useState<'ai' | 'plan' | null>(null)
  const [aiItems, setAiItems] = useState<AiItem[]>([])
  const aiStatus = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.ai.status(), staleTime: 30_000 })

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v)
          return next
        },
        { replace: true }
      ),
    [setParams]
  )

  // ─── Selección actual: materia → documento → apunte ──────────────────────
  const subjects = useSubjects()
  const subjectId = params.get('subject') ?? subjects.data?.[0]?.id ?? null

  const docs = useQuery({
    queryKey: queryKeys.documents(subjectId ?? ''),
    queryFn: () => api.documents.list(subjectId!),
    enabled: !!subjectId
  })
  const docParam = params.get('doc')
  const docFromList = docs.data?.find((d) => d.id === docParam) ?? (docParam ? undefined : docs.data?.[0])
  // El documento puede ser de otra materia (al seguir un deep link): se busca directo.
  const docDirect = useQuery({
    queryKey: ['documents', 'byId', docParam],
    queryFn: () => api.documents.get(docParam!),
    enabled: !!docParam && !docFromList && !!docs.data
  })
  const doc: DocumentRecord | undefined = docFromList ?? docDirect.data

  const notes = useQuery({
    queryKey: queryKeys.notes(subjectId ?? ''),
    queryFn: () => api.notes.list(subjectId!),
    enabled: !!subjectId
  })
  const noteParam = params.get('note')
  const noteId =
    noteParam ?? notes.data?.find((n) => n.documentId === doc?.id)?.id ?? (doc ? null : notes.data?.[0]?.id) ?? null
  const note = useQuery({
    queryKey: queryKeys.note(noteId ?? ''),
    queryFn: () => api.notes.get(noteId!),
    enabled: !!noteId,
    staleTime: Infinity
  })

  const folders = useQuery({
    queryKey: queryKeys.folders(subjectId ?? ''),
    queryFn: () => api.folders.list(subjectId!),
    enabled: !!subjectId
  })
  /** "📐 Prácticos / Guía 1": ruta de carpetas para agrupar los selectores. */
  const folderPath = (folderId: string | null): string | undefined => {
    if (!folderId) return undefined
    const parts: string[] = []
    for (let f = folders.data?.find((x) => x.id === folderId); f; f = folders.data?.find((x) => x.id === f!.parentId)) parts.unshift(`${f.emoji} ${f.name}`)
    return parts.join(' / ')
  }
  /** Lo nuevo (PDFs importados, apuntes) va a la carpeta del documento abierto. */
  const currentFolderId = doc?.folderId ?? null

  const anchors = useQuery({
    queryKey: queryKeys.anchors(doc?.id ?? ''),
    queryFn: () => api.anchors.listByDocument(doc!.id),
    enabled: !!doc
  })

  const notify = useCallback(
    (kind: 'info' | 'error', text: string, action?: { label: string; run: () => void }) => setToast({ kind, text, action }),
    []
  )
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  // ─── Importación de PDFs ─────────────────────────────────────────────────
  const afterImport = (results: { document: DocumentRecord; duplicate: boolean }[], failed: string[]) => {
    void qc.invalidateQueries({ queryKey: queryKeys.documents(subjectId ?? '') })
    const first = results[0]
    if (first) setParam({ doc: first.document.id, note: null })
    const dups = results.filter((r) => r.duplicate).length
    if (failed.length) notify('error', failed.join(' · '))
    else if (results.length)
      notify('info', `${results.length - dups} PDF importado(s)${dups ? ` · ${dups} ya estaba(n) en la materia` : ''}`)
  }

  const importFiles = async (files: File[]) => {
    if (!subjectId) return
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) return notify('error', 'Solo se pueden importar archivos PDF')
    setImporting(true)
    const ok: { document: DocumentRecord; duplicate: boolean }[] = []
    const failed: string[] = []
    for (const f of pdfs) {
      try {
        ok.push(await api.documents.import(subjectId, api.documents.pathForFile(f), currentFolderId))
      } catch (err) {
        failed.push(`${f.name}: ${ipcErrorMessage(err)}`)
      }
    }
    setImporting(false)
    afterImport(ok, failed)
  }

  const importDialog = async () => {
    if (!subjectId) return
    setImporting(true)
    try {
      const { imported, failed } = await api.documents.importDialog(subjectId, currentFolderId)
      afterImport(imported, failed.map((f) => `${f.fileName}: ${f.error}`))
    } finally {
      setImporting(false)
    }
  }

  // ─── Apuntes: crear y autoguardar ────────────────────────────────────────
  const createNote = useMutation({
    mutationFn: () =>
      api.notes.create({
        subjectId: subjectId!,
        documentId: doc?.id ?? null,
        folderId: currentFolderId,
        title: doc ? `Apuntes · ${doc.title}` : 'Sin título'
      }),
    onSuccess: (n) => {
      qc.setQueryData(queryKeys.note(n.id), n)
      void qc.invalidateQueries({ queryKey: queryKeys.notes(n.subjectId) })
      setParam({ note: n.id })
    }
  })

  const persist = useCallback(
    async (id: string, patch: { content?: string; title?: string }) => {
      setSaveState('saving')
      try {
        const saved = await api.notes.update(id, patch)
        // Se actualiza la caché sin re-renderizar el editor (su contenido ya es el más nuevo).
        qc.setQueryData<Note>(queryKeys.note(id), saved)
        void qc.invalidateQueries({ queryKey: queryKeys.notes(saved.subjectId) })
        setSaveState('saved')
      } catch (err) {
        setSaveState('error')
        notify('error', `No se pudo guardar: ${ipcErrorMessage(err)}`)
      }
    },
    [qc, notify]
  )
  const saveContent = useDebouncedCallback((id: string, content: string) => void persist(id, { content }), 700)

  // ─── Progreso de lectura ─────────────────────────────────────────────────
  const trackPage = useDebouncedCallback((id: string, page: number) => void api.documents.trackPage(id, page), 1000)

  // ─── Deep links: abrir un ancla ──────────────────────────────────────────
  const openAnchor = useCallback(
    async (anchorId: string) => {
      try {
        const anchor = await api.anchors.get(anchorId)
        const target = await api.documents.get(anchor.documentId)
        saveContent.flush()
        setParam({ subject: target.subjectId, doc: target.id, ...(noteId ? { note: noteId } : {}), anchor: null })
        setFocus({ anchor, nonce: Date.now() })
      } catch {
        notify('error', 'El documento de este enlace ya no existe')
      }
    },
    [noteId, setParam, notify, saveContent]
  )

  // ?anchor=<id> en la URL (desde otras pantallas) → se abre y se limpia el parámetro.
  const anchorParam = params.get('anchor')
  useEffect(() => {
    if (anchorParam) void openAnchor(anchorParam)
  }, [anchorParam, openAnchor])

  const onAnchorCreated = (a: PdfAnchor) => void qc.invalidateQueries({ queryKey: queryKeys.anchors(a.documentId) })

  // ─── Asistente de IA ─────────────────────────────────────────────────────
  const patchItem = (id: string, patch: Partial<AiItem> | ((it: AiItem) => Partial<AiItem>)) =>
    setAiItems((items) => items.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)))

  const runAi = (task: AiTask, draft: AnchorDraft | null, text: string, reuseId?: string) => {
    const id = reuseId ?? crypto.randomUUID()
    const item: AiItem = { id, task, draft, text: '', status: 'streaming' }
    setAiItems((items) => (reuseId ? items.map((it) => (it.id === id ? item : it)) : [item, ...items].slice(0, 20)))
    setAssistant('ai')
    const subject = subjects.data?.find((s) => s.id === doc?.subjectId)
    const { requestId, done } = api.ai.run(
      { task, text, documentTitle: doc?.title ?? null, subjectName: subject?.name ?? null, page: draft?.page ?? null },
      (delta) => patchItem(id, (it) => ({ text: it.text + delta }))
    )
    patchItem(id, { requestId })
    done
      .then((r) => patchItem(id, { status: 'done', text: r.text, model: r.model }))
      .catch((err: unknown) => patchItem(id, { status: 'error', error: ipcErrorMessage(err) }))
  }

  const onAiRequest = (task: 'simplify' | 'summarize', draft: AnchorDraft) => {
    if (!draft.selectedText) return notify('error', 'El recorte no tiene texto seleccionable para la IA')
    runAi(task, draft, draft.selectedText)
  }

  const insertDraft = (draft: AnchorDraft) => {
    if (!editorRef.current) return notify('error', 'Abrí o creá un apunte para insertar el enlace')
    void editorRef.current.insertDraft(draft)
  }

  // ─── Divisor redimensionable ─────────────────────────────────────────────
  const splitRef = useRef<HTMLDivElement>(null)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const box = splitRef.current!.getBoundingClientRect()
    const move = (ev: MouseEvent) => setSplit(Math.min(0.8, Math.max(0.25, (ev.clientX - box.left) / box.width)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (subjects.isSuccess && !subjects.data.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={Library}
          title="Primero creá una materia"
          description="Los PDFs y apuntes se organizan por materia."
          action={
            <Link to="/materias">
              <Button variant="primary">Ir a Materias</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barra de contexto */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <Select
          label="Materia"
          value={subjectId ?? ''}
          onChange={(v) => setParam({ subject: v, doc: null, note: null })}
          options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Documento"
          value={doc?.id ?? ''}
          onChange={(v) => setParam({ doc: v, note: null })}
          placeholder="Sin documentos"
          options={[
            ...(docs.data ?? []).map((d) => ({ value: d.id, label: `${d.title} · ${d.pageCount} p.`, group: folderPath(d.folderId) })),
            ...(doc && !docs.data?.some((d) => d.id === doc.id) ? [{ value: doc.id, label: `${doc.title} (otra materia)` }] : [])
          ]}
        />
        <Button size="sm" variant="ghost" onClick={importDialog} disabled={!subjectId || importing} title="Importar PDF">
          {importing ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} Importar
        </Button>

        <span className="flex-1" />

        <Select
          label="Apunte"
          value={noteId ?? ''}
          onChange={(v) => {
            saveContent.flush()
            setParam({ note: v })
          }}
          placeholder="Sin apunte"
          options={(notes.data ?? []).map((n) => ({ value: n.id, label: n.title, group: folderPath(n.folderId) }))}
        />
        <Button size="sm" variant="ghost" onClick={() => createNote.mutate()} disabled={!subjectId} title="Nuevo apunte">
          <Plus size={14} /> Apunte
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAssistant((a) => (a ? null : 'ai'))}
          aria-pressed={!!assistant}
          className={cn(assistant && 'bg-selected text-fg')}
          title="Asistente y plan de lectura"
        >
          <Bot size={14} /> Asistente
          {aiItems.some((i) => i.status === 'streaming') && <Loader2 size={12} className="animate-spin" />}
        </Button>
        <SaveIndicator state={saveState} />
      </div>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        {/* Panel izquierdo: PDF */}
        <DropZone onFiles={importFiles} className="min-w-0" style={{ width: `${split * 100}%` }}>
          {doc ? (
            <PdfViewer
              document={doc}
              anchors={anchors.data ?? []}
              focus={focus}
              onPageChange={(p) => trackPage.call(doc.id, p)}
              onInsertDraft={insertDraft}
              onAiRequest={onAiRequest}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-surface-2/40">
              <EmptyState
                icon={Upload}
                title={docs.isLoading ? 'Cargando…' : 'Arrastrá PDFs acá'}
                description="Se copian a tu biblioteca local, organizados por materia."
                action={
                  <Button variant="primary" onClick={importDialog} disabled={importing}>
                    <FilePlus2 size={15} /> Elegir archivos
                  </Button>
                }
              />
            </div>
          )}
        </DropZone>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize}
          onDoubleClick={() => setSplit(0.55)}
          className="group relative w-px shrink-0 cursor-col-resize bg-line"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5 group-hover:bg-accent/20" />
        </div>

        {/* Panel derecho: apunte (+ asistente superpuesto) */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <AnimatePresence>
          {assistant && (
            <AssistantPanel
              key="assistant"
              tab={assistant}
              onTab={setAssistant}
              onClose={() => setAssistant(null)}
              items={aiItems}
              aiReady={!!aiStatus.data?.configured}
              onCancel={(it) => it.requestId && void api.ai.cancel(it.requestId)}
              onRetry={(it) => runAi(it.task, it.draft, it.draft?.selectedText ?? '', it.id)}
              onDismiss={(it) => setAiItems((items) => items.filter((x) => x.id !== it.id))}
              onInsert={(it) => {
                if (!editorRef.current) return notify('error', 'Abrí o creá un apunte para insertar la explicación')
                if (it.draft) void editorRef.current.insertAiResult(it.draft, TASK_LABEL[it.task], it.text)
              }}
              document={doc ?? null}
              subjectName={subjects.data?.find((s) => s.id === doc?.subjectId)?.name ?? null}
              onAdvice={(planJson) => runAi('reading-advice', null, planJson)}
            />
          )}
          </AnimatePresence>
          {note.data ? (
            <>
              <NoteTitle key={note.data.id} note={note.data} onSave={(title) => void persist(note.data!.id, { title })} />
              <div className="min-h-0 flex-1">
                <NoteEditor
                  key={note.data.id}
                  ref={editorRef}
                  noteId={note.data.id}
                  initialMarkdown={note.data.content}
                  onChange={(md) => {
                    setSaveState('saving')
                    saveContent.call(note.data!.id, md)
                  }}
                  onOpenAnchor={(id) => void openAnchor(id)}
                  onAnchorCreated={onAnchorCreated}
                  onError={(m) => notify('error', m)}
                  onExported={(path) =>
                    notify('info', `Exportado: ${path.split(/[\\/]/).pop()}`, {
                      label: 'Mostrar en Finder',
                      run: () => void api.notes.revealExport(path)
                    })
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={NotebookPen}
                title={noteId && note.isLoading ? 'Cargando…' : 'Sin apunte abierto'}
                description="Creá un apunte para este documento. Podés arrastrar texto o recortes del PDF y quedan enlazados a su página exacta."
                action={
                  <Button variant="primary" onClick={() => createNote.mutate()} disabled={!subjectId}>
                    <Plus size={15} /> Nuevo apunte
                  </Button>
                }
              />
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.text}
          variants={toastMotion}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="status"
          className={cn(
            'fixed right-5 bottom-5 z-50 flex max-w-md items-start gap-2 rounded-card border bg-surface px-3 py-2 text-xs shadow-lg',
            toast.kind === 'error' ? 'border-danger/40 text-danger' : 'border-line text-fg'
          )}
        >
          <span className="flex-1">{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run()
                setToast(null)
              }}
              className="shrink-0 font-semibold text-accent hover:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button onClick={() => setToast(null)} aria-label="Cerrar" className="text-fg-subtle hover:text-fg">
            <X size={13} />
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

function NoteTitle({ note, onSave }: { note: Note; onSave: (title: string) => void }) {
  const [title, setTitle] = useState(note.title)
  const commit = () => {
    const t = title.trim() || 'Sin título'
    if (t !== note.title) onSave(t)
    setTitle(t)
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
      <FileText size={14} className="shrink-0 text-fg-subtle" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Título del apunte"
        className="min-w-0 flex-1 bg-transparent font-display text-sm font-semibold text-fg focus:outline-none"
      />
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = { idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'Error al guardar' }[state]
  return (
    <span className={cn('w-20 text-right text-[11px]', state === 'error' ? 'text-danger' : 'text-fg-subtle')}>{text}</span>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
}) {
  // Primero los de la raíz; después un grupo por carpeta (en orden de aparición).
  const root = options.filter((o) => !o.group)
  const groups = [...new Set(options.filter((o) => o.group).map((o) => o.group!))]
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!options.length}
      className="h-7 max-w-56 truncate rounded-card border border-line bg-surface px-2 text-xs text-fg hover:bg-surface-2 focus:border-accent focus:outline-none disabled:text-fg-subtle"
    >
      {!options.length && <option value="">{placeholder ?? '—'}</option>}
      {root.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options
            .filter((o) => o.group === g)
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Acepta PDFs arrastrados desde el sistema (Finder/Explorador), no arrastres internos. */
function DropZone({
  onFiles,
  children,
  className,
  style
}: {
  onFiles: (files: File[]) => void
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const [over, setOver] = useState(false)
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      className={cn('relative', className)}
      style={style}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-card border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">
          Soltá para importar a la materia
        </div>
      )}
    </div>
  )
}
