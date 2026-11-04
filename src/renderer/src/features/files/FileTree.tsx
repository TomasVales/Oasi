import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, FilePlus2, FileText, FolderPlus, MoreHorizontal, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DocumentRecord, Folder, Note } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { popover, spring } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { usePersistentState } from '@/hooks/usePersistentState'
import { FolderDialog } from './FolderDialog'
import { useToast } from '@/features/toast/ToastProvider'

const ITEM_MIME = 'application/x-studentos-item'
type DragItem = { kind: 'document' | 'note' | 'folder'; id: string }

const readItem = (dt: DataTransfer): DragItem | null => {
  try {
    return JSON.parse(dt.getData(ITEM_MIME)) as DragItem
  } catch {
    return null
  }
}

type DialogState = { mode: 'create'; parentId: string | null } | { mode: 'edit'; folder: Folder } | null

/**
 * Árbol de archivos de una materia: carpetas con emoji (anidables) que contienen PDFs y apuntes.
 * Se reorganiza arrastrando ítems y carpetas sobre otra carpeta (o sobre "Archivos" → raíz).
 */
export function FileTree({ subjectId }: { subjectId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const folders = useQuery({ queryKey: queryKeys.folders(subjectId), queryFn: () => api.folders.list(subjectId) })
  const docs = useQuery({ queryKey: queryKeys.documents(subjectId), queryFn: () => api.documents.list(subjectId) })
  const notes = useQuery({ queryKey: queryKeys.notes(subjectId), queryFn: () => api.notes.list(subjectId) })
  const [collapsed, setCollapsed] = usePersistentState<string[]>('files.collapsed', [])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [rootOver, setRootOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Ítems borrados que todavía se pueden recuperar con "Deshacer" (se ocultan ya). */
  const [trashed, setTrashed] = useState<string[]>([])
  const toast = useToast()

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.folders(subjectId) })
    void qc.invalidateQueries({ queryKey: queryKeys.documents(subjectId) })
    void qc.invalidateQueries({ queryKey: queryKeys.notes(subjectId) })
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(ipcErrorMessage(err))
    }
  }

  const tree = useMemo(() => {
    const childFolders = new Map<string | null, Folder[]>()
    for (const f of folders.data ?? []) childFolders.set(f.parentId, [...(childFolders.get(f.parentId) ?? []), f])
    const docsIn = new Map<string | null, DocumentRecord[]>()
    for (const d of (docs.data ?? []).filter((x) => !trashed.includes(x.id))) docsIn.set(d.folderId, [...(docsIn.get(d.folderId) ?? []), d])
    const notesIn = new Map<string | null, Note[]>()
    for (const n of (notes.data ?? []).filter((x) => !trashed.includes(x.id))) notesIn.set(n.folderId, [...(notesIn.get(n.folderId) ?? []), n])
    const count = (id: string): number =>
      (docsIn.get(id)?.length ?? 0) + (notesIn.get(id)?.length ?? 0) + (childFolders.get(id) ?? []).reduce((a, f) => a + count(f.id), 0)
    return { childFolders, docsIn, notesIn, count }
  }, [folders.data, docs.data, notes.data, trashed])

  const moveTo = (item: DragItem, folderId: string | null) =>
    run(() =>
      item.kind === 'document'
        ? api.documents.move(item.id, folderId)
        : item.kind === 'note'
          ? api.notes.move(item.id, folderId)
          : api.folders.update(item.id, { parentId: folderId })
    )

  /**
   * Borrar con "Deshacer": se oculta al instante y se borra de verdad cuando el aviso se va.
   * Si estaba abierto, primero se sale de esa vista (el editor no guarda sobre algo borrado).
   */
  const removeItem = (item: DragItem, label: string) => {
    if (item.kind === 'folder') return
    const open = item.kind === 'document' ? params.get('doc') === item.id : params.get('note') === item.id
    if (open && pathname === '/estudio') navigate(`/estudio?subject=${subjectId}`)
    setTrashed((t) => [...t, item.id])
    const restore = () => setTrashed((t) => t.filter((x) => x !== item.id))
    toast.undoable({
      text: `${item.kind === 'note' ? 'Apunte' : 'PDF'} “${label}” eliminado`,
      commit: async () => {
        if (item.kind === 'document') await api.documents.remove(item.id)
        else await api.notes.remove(item.id)
        // Se espera la lista nueva antes de "des-ocultar": así no reaparece un instante.
        await Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.documents(subjectId) }),
          qc.invalidateQueries({ queryKey: queryKeys.notes(subjectId) })
        ])
        restore()
      },
      undo: restore,
      onError: (err) => toast.show({ kind: 'error', text: `No se pudo eliminar: ${ipcErrorMessage(err)}` })
    })
  }

  const docParam = params.get('doc')
  const noteParam = params.get('note')
  const q = `subject=${subjectId}`

  const renderItems = (folderId: string | null, depth: number) => (
    <>
      {(tree.childFolders.get(folderId) ?? []).map((f) => (
        <FolderRow
          key={f.id}
          folder={f}
          depth={depth}
          count={tree.count(f.id)}
          open={!collapsed.includes(f.id)}
          onToggle={() => setCollapsed((c) => (c.includes(f.id) ? c.filter((x) => x !== f.id) : [...c, f.id]))}
          onDropItem={(item) => item.id !== f.id && void moveTo(item, f.id)}
          onNewSubfolder={() => setDialog({ mode: 'create', parentId: f.id })}
          onImport={() => void run(() => api.documents.importDialog(subjectId, f.id))}
          onNewNote={() =>
            void run(async () => {
              const n = await api.notes.create({ subjectId, folderId: f.id, title: `${f.emoji} Nuevo apunte` })
              navigate(`/estudio?${q}&note=${n.id}`)
            })
          }
          onEdit={() => setDialog({ mode: 'edit', folder: f })}
          onDelete={() => void run(() => api.folders.remove(f.id))}
        >
          {renderItems(f.id, depth + 1)}
        </FolderRow>
      ))}
      {(tree.docsIn.get(folderId) ?? []).map((d) => (
        <ItemRow
          key={d.id}
          item={{ kind: 'document', id: d.id }}
          depth={depth}
          to={`/estudio?${q}&doc=${d.id}`}
          icon={FileText}
          label={d.title}
          hint={`${d.pageCount} págs. · leído hasta la ${d.maxPageRead}`}
          active={pathname === '/estudio' && docParam === d.id && !noteParam}
          muted={d.maxPageRead >= d.pageCount}
          onDelete={() => removeItem({ kind: 'document', id: d.id }, d.title)}
        />
      ))}
      {(tree.notesIn.get(folderId) ?? []).map((n) => (
        <ItemRow
          key={n.id}
          item={{ kind: 'note', id: n.id }}
          depth={depth}
          to={`/estudio?${q}${n.documentId ? `&doc=${n.documentId}` : ''}&note=${n.id}`}
          icon={NotebookPen}
          label={n.title}
          active={pathname === '/estudio' && noteParam === n.id}
          onDelete={() => removeItem({ kind: 'note', id: n.id }, n.title)}
        />
      ))}
    </>
  )

  const empty = !folders.data?.length && !docs.data?.length && !notes.data?.length

  return (
    <div className="pt-5">
      <div
        className={cn('flex items-center gap-1 rounded-[8px] px-2 py-0.5', rootOver && 'bg-accent-soft ring-1 ring-accent')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(ITEM_MIME)) return
          e.preventDefault()
          setRootOver(true)
        }}
        onDragLeave={() => setRootOver(false)}
        onDrop={(e) => {
          setRootOver(false)
          const item = readItem(e.dataTransfer)
          if (item) {
            e.preventDefault()
            void moveTo(item, null)
          }
        }}
        title="Soltá acá para mover a la raíz de la materia"
      >
        <span className="flex-1 text-[12px] font-semibold text-fg-muted">Archivos</span>
        <button
          onClick={() => setDialog({ mode: 'create', parentId: null })}
          aria-label="Nueva carpeta"
          title="Nueva carpeta"
          className="no-drag flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <FolderPlus size={14} />
        </button>
      </div>
      <div className="mt-1 space-y-px">
        {empty ? (
          <p className="px-2.5 py-1 text-xs text-fg-subtle">Arrastrá PDFs en Estudio o creá una carpeta.</p>
        ) : (
          renderItems(null, 0)
        )}
      </div>
      {error && <p className="px-2.5 pt-1 text-[11px] text-danger">{error}</p>}

      <AnimatePresence>
        {dialog && (
          <FolderDialog
            key="folder-dialog"
            title={dialog.mode === 'create' ? (dialog.parentId ? 'Nueva subcarpeta' : 'Nueva carpeta') : 'Editar carpeta'}
            initial={dialog.mode === 'edit' ? { name: dialog.folder.name, emoji: dialog.folder.emoji } : undefined}
            onClose={() => setDialog(null)}
            onSave={(v) => {
              const d = dialog
              setDialog(null)
              void run(() =>
                d.mode === 'create'
                  ? api.folders.create({ subjectId, parentId: d.parentId, ...v })
                  : api.folders.update(d.folder.id, v)
              )
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

const indent = (depth: number) => ({ paddingLeft: 10 + depth * 14 })

function ItemRow({
  item,
  depth,
  to,
  icon: Icon,
  label,
  hint,
  active,
  muted,
  onDelete
}: {
  item: DragItem
  depth: number
  to: string
  icon: typeof FileText
  label: string
  hint?: string
  active: boolean
  muted?: boolean
  onDelete: () => void
}) {
  const what = item.kind === 'note' ? 'apunte' : 'PDF'
  return (
    <div className="group relative">
      <Link
        to={to}
        title={hint}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ITEM_MIME, JSON.stringify(item))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            onDelete()
          }
        }}
        style={indent(depth)}
        className={cn(
          'no-drag relative flex h-8 items-center gap-2 rounded-[8px] pr-8 text-[13.5px] transition-colors',
          active
            ? 'bg-selected font-medium text-fg arcade:text-accent before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
            : cn('hover:bg-hover hover:text-fg', muted ? 'text-fg-subtle' : 'text-fg-muted')
        )}
      >
        <Icon size={15} strokeWidth={1.9} className="shrink-0 text-fg-subtle" />
        <span className="truncate">{label}</span>
      </Link>
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <RowButton label={`Eliminar ${what} “${label}”`} onClick={onDelete}>
          <Trash2 size={13} />
        </RowButton>
      </div>
    </div>
  )
}

function FolderRow({
  folder,
  depth,
  count,
  open,
  onToggle,
  onDropItem,
  onNewSubfolder,
  onImport,
  onNewNote,
  onEdit,
  onDelete,
  children
}: {
  folder: Folder
  depth: number
  count: number
  open: boolean
  onToggle: () => void
  onDropItem: (item: DragItem) => void
  onNewSubfolder: () => void
  onImport: () => void
  onNewNote: () => void
  onEdit: () => void
  onDelete: () => void
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  const [menu, setMenu] = useState<'add' | 'more' | null>(null)
  const [confirm, setConfirm] = useState(false)

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ITEM_MIME, JSON.stringify({ kind: 'folder', id: folder.id } satisfies DragItem))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(ITEM_MIME)) return
          e.preventDefault()
          e.stopPropagation()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false)
          const item = readItem(e.dataTransfer)
          if (!item) return
          e.preventDefault()
          e.stopPropagation()
          onDropItem(item)
        }}
        style={indent(depth)}
        className={cn(
          'no-drag group relative flex h-8 items-center gap-1.5 rounded-[8px] pr-1 text-[13.5px] text-fg hover:bg-hover',
          over && 'bg-accent-soft ring-1 ring-accent'
        )}
      >
        <button onClick={onToggle} aria-expanded={open} aria-label={open ? `Plegar ${folder.name}` : `Desplegar ${folder.name}`} title={`${folder.emoji} ${folder.name}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <ChevronRight size={13} className={cn('shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-90')} />
          <span className="text-[15px] leading-none" aria-hidden>
            {folder.emoji}
          </span>
          <span className="truncate font-medium">{folder.name}</span>
          <span className="shrink-0 text-[10px] text-fg-subtle tabular-nums">{count || ''}</span>
        </button>
        <div className={cn('relative flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100', menu && 'opacity-100')}>
          <RowButton label={`Agregar en ${folder.name}`} onClick={() => setMenu(menu === 'add' ? null : 'add')}>
            <Plus size={13} />
          </RowButton>
          <RowButton label={`Opciones de ${folder.name}`} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
            <MoreHorizontal size={13} />
          </RowButton>
          <AnimatePresence>
            {menu && (
              <motion.div
                variants={popover}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{ transformOrigin: 'top right' }}
                role="menu"
                className="absolute top-7 right-0 z-50 w-52 rounded-[10px] border border-line bg-surface p-1 text-[13px] shadow-xl"
                onMouseLeave={() => {
                  setMenu(null)
                  setConfirm(false)
                }}
              >
                {menu === 'add' ? (
                  <>
                    <MenuItem icon={<FilePlus2 size={14} />} onClick={() => (setMenu(null), onImport())}>
                      Importar PDF aquí
                    </MenuItem>
                    <MenuItem icon={<NotebookPen size={14} />} onClick={() => (setMenu(null), onNewNote())}>
                      Nuevo apunte aquí
                    </MenuItem>
                    <MenuItem icon={<FolderPlus size={14} />} onClick={() => (setMenu(null), onNewSubfolder())}>
                      Nueva subcarpeta
                    </MenuItem>
                  </>
                ) : confirm ? (
                  <div className="space-y-1.5 p-1.5">
                    <p className="text-xs text-fg-muted">¿Eliminar “{folder.name}”? Sus PDFs y apuntes vuelven a la raíz.</p>
                    <button onClick={() => (setMenu(null), onDelete())} className="h-7 w-full rounded-[6px] bg-danger text-xs font-medium text-white">
                      Eliminar carpeta
                    </button>
                  </div>
                ) : (
                  <>
                    <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), onEdit())}>
                      Renombrar / emoji
                    </MenuItem>
                    <MenuItem icon={<Trash2 size={14} />} danger onClick={() => setConfirm(true)}>
                      Eliminar…
                    </MenuItem>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.sheet}
            className="space-y-px overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-selected hover:text-fg"
    >
      {children}
    </button>
  )
}

function MenuItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left',
        danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-accent hover:text-accent-fg'
      )}
    >
      {icon}
      {children}
    </button>
  )
}
