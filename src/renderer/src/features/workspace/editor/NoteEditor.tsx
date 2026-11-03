import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Mathematics } from '@tiptap/extension-mathematics'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Placeholder } from '@tiptap/extension-placeholder'
import { common, createLowlight } from 'lowlight'
import {
  Download,
  FileDown,
  FileType2,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Sigma,
  SquareFunction
} from 'lucide-react'
import 'katex/dist/katex.min.css'
import { AnimatePresence, motion } from 'framer-motion'
import { popover } from '@/lib/motion'
import type { PdfAnchor } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import {
  ANCHOR_HREF_PREFIX,
  anchorHref,
  anchorIdFromHref,
  anchorLabel,
  readDraftFromDataTransfer,
  type AnchorDraft
} from '../anchorDraft'
import { MathDialog, type MathEditRequest } from './MathDialog'

const lowlight = createLowlight(common)

export interface NoteEditorHandle {
  /** Crea el ancla en la DB e inserta el enlace en la posición del cursor. */
  insertDraft: (draft: AnchorDraft) => Promise<void>
  /** Inserta una respuesta de la IA como cita, enlazada a la posición del PDF de donde salió. */
  insertAiResult: (draft: AnchorDraft, title: string, markdown: string) => Promise<void>
}

interface Props {
  noteId: string
  initialMarkdown: string
  onChange: (markdown: string) => void
  onOpenAnchor: (anchorId: string) => void
  onAnchorCreated: (anchor: PdfAnchor) => void
  onError: (message: string) => void
  /** Se exportó el apunte a esta ruta. */
  onExported?: (path: string) => void
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  { noteId, initialMarkdown, onChange, onOpenAnchor, onAnchorCreated, onError, onExported },
  ref
) {
  const [math, setMath] = useState<MathEditRequest | null>(null)
  const cb = useRef({ onChange, onOpenAnchor, onAnchorCreated, onError, onExported })
  cb.current = { onChange, onOpenAnchor, onAnchorCreated, onError, onExported }
  const editorRef = useRef<Editor | null>(null)

  /** Crea el ancla y escribe el enlace en `pos`. */
  const insertAnchorAt = async (draft: AnchorDraft, pos: number) => {
    const editor = editorRef.current
    if (!editor) return
    try {
      const anchor = await api.anchors.create({ ...draft, noteId })
      const safePos = Math.min(pos, editor.state.doc.content.size)
      editor
        .chain()
        .focus()
        .insertContentAt(safePos, [
          { type: 'text', text: anchorLabel(draft), marks: [{ type: 'link', attrs: { href: anchorHref(anchor.id) } }] },
          { type: 'text', text: ' ' }
        ])
        .run()
      cb.current.onAnchorCreated(anchor)
    } catch (err) {
      cb.current.onError(`No se pudo crear el enlace: ${ipcErrorMessage(err)}`)
    }
  }

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          // studentos:// es el esquema de los deep links; el resto, la validación por defecto.
          isAllowedUri: (url, ctx) => url.startsWith(ANCHOR_HREF_PREFIX) || ctx.defaultValidate(url)
        }
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        inlineOptions: { onClick: (node, pos) => setMath({ mode: 'inline', latex: node.attrs['latex'] ?? '', pos }) },
        blockOptions: { onClick: (node, pos) => setMath({ mode: 'block', latex: node.attrs['latex'] ?? '', pos }) }
      }),
      Placeholder.configure({
        placeholder: 'Escribí tus apuntes… Arrastrá texto del PDF para enlazarlo. $x^2$ para fórmulas, ``` para código.'
      }),
      Markdown
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'note-prose', spellcheck: 'true' },
      handleDrop: (view, event) => {
        const draft = readDraftFromDataTransfer(event.dataTransfer)
        if (!draft) return false // otros drops (texto, archivos) siguen el comportamiento normal
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to
        void insertAnchorAt(draft, pos)
        return true
      },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement | null)?.closest('a')
        const href = a?.getAttribute('href')
        if (!href) return false
        const anchorId = anchorIdFromHref(href)
        if (anchorId) {
          cb.current.onOpenAnchor(anchorId)
          return true
        }
        if (/^https?:\/\//.test(href)) {
          window.open(href, '_blank') // el main lo deriva al navegador del sistema
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor }) => cb.current.onChange(editor.getMarkdown())
  })
  editorRef.current = editor

  const insertAiResult = async (draft: AnchorDraft, title: string, markdown: string) => {
    const editor = editorRef.current
    if (!editor) return
    try {
      const anchor = await api.anchors.create({ ...draft, noteId })
      const quoted = markdown
        .trim()
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
      const md = `> **${title}** · [${anchorLabel(draft)}](${anchorHref(anchor.id)})\n>\n${quoted}\n\n`
      editor.chain().focus().insertContent(md, { contentType: 'markdown' }).run()
      cb.current.onAnchorCreated(anchor)
    } catch (err) {
      cb.current.onError(`No se pudo insertar: ${ipcErrorMessage(err)}`)
    }
  }

  useImperativeHandle(ref, () => ({
    insertDraft: (draft) => insertAnchorAt(draft, editorRef.current?.state.selection.to ?? 0),
    insertAiResult
  }))

  /** Exporta lo que se ve en el editor (no lo último guardado): nunca se pierde lo recién escrito. */
  const exportNote = async (kind: 'md' | 'pdf') => {
    const ed = editorRef.current
    if (!ed) return
    try {
      let path: string | null
      if (kind === 'md') {
        path = await api.notes.exportMarkdown(noteId, ed.getMarkdown())
      } else {
        // Se imprime el DOM ya renderizado (KaTeX, resaltado de código), sin elementos de edición.
        const root = ed.view.dom.cloneNode(true) as HTMLElement
        root.querySelectorAll('a[href^="studentos://"]').forEach((a) => {
          const span = document.createElement('span')
          span.className = 'ref'
          span.textContent = a.textContent
          a.replaceWith(span)
        })
        root.querySelectorAll('.ProseMirror-trailingBreak, .ProseMirror-separator').forEach((n) => n.remove())
        root.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
        path = await api.notes.exportPdf(noteId, root.innerHTML)
      }
      if (path) cb.current.onExported?.(path)
    } catch (err) {
      cb.current.onError(`No se pudo exportar: ${ipcErrorMessage(err)}`)
    }
  }

  const saveMath = (latex: string) => {
    if (!math || !editor) return
    const chain = editor.chain().focus()
    if (math.pos === undefined) {
      if (math.mode === 'inline') chain.insertInlineMath({ latex }).run()
      else chain.insertBlockMath({ latex }).run()
    } else if (math.mode === 'inline') chain.updateInlineMath({ latex, pos: math.pos }).run()
    else chain.updateBlockMath({ latex, pos: math.pos }).run()
    setMath(null)
  }

  const deleteMath = () => {
    if (!math || math.pos === undefined || !editor) return
    if (math.mode === 'inline') editor.chain().focus().deleteInlineMath({ pos: math.pos }).run()
    else editor.chain().focus().deleteBlockMath({ pos: math.pos }).run()
    setMath(null)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <Toolbar editor={editor} onMath={(mode) => setMath({ mode, latex: '' })} onExport={(k) => void exportNote(k)} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="mx-auto max-w-3xl px-8 py-6" />
      </div>
      <AnimatePresence>
      {math && (
        <MathDialog
          key="math"
          request={math}
          onSave={saveMath}
          onDelete={math.pos !== undefined ? deleteMath : undefined}
          onClose={() => setMath(null)}
        />
      )}
      </AnimatePresence>
    </div>
  )
})

function Toolbar({
  editor,
  onMath,
  onExport
}: {
  editor: Editor
  onMath: (mode: 'inline' | 'block') => void
  onExport: (kind: 'md' | 'pdf') => void
}) {
  const [exportOpen, setExportOpen] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock')
    })
  })
  const c = () => editor.chain().focus()
  const items = [
    { icon: Bold, label: 'Negrita (⌘B)', active: s.bold, run: () => c().toggleBold().run() },
    { icon: Italic, label: 'Cursiva (⌘I)', active: s.italic, run: () => c().toggleItalic().run() },
    { icon: Heading1, label: 'Título', active: s.h1, run: () => c().toggleHeading({ level: 1 }).run() },
    { icon: Heading2, label: 'Subtítulo', active: s.h2, run: () => c().toggleHeading({ level: 2 }).run() },
    { icon: List, label: 'Lista', active: s.bullet, run: () => c().toggleBulletList().run() },
    { icon: ListOrdered, label: 'Lista numerada', active: s.ordered, run: () => c().toggleOrderedList().run() },
    { icon: Quote, label: 'Cita', active: s.quote, run: () => c().toggleBlockquote().run() },
    { icon: Code2, label: 'Bloque de código', active: s.code, run: () => c().toggleCodeBlock().run() },
    { icon: Sigma, label: 'Fórmula en línea ($…$)', active: false, run: () => onMath('inline') },
    { icon: SquareFunction, label: 'Fórmula en bloque ($$…$$)', active: false, run: () => onMath('block') }
  ]
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line bg-surface px-2">
      {items.map(({ icon: Icon, label, active, run }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()} // no robar el foco del editor
          onClick={run}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg',
            active && 'bg-accent-soft text-accent'
          )}
        >
          <Icon size={15} />
        </button>
      ))}
      <span className="flex-1" />
      <div className="relative" onMouseLeave={() => setExportOpen(false)}>
        <button
          type="button"
          title="Exportar apunte"
          aria-label="Exportar apunte"
          aria-expanded={exportOpen}
          onClick={() => setExportOpen((v) => !v)}
          className={cn('flex h-7 items-center gap-1 rounded px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg', exportOpen && 'bg-surface-2 text-fg')}
        >
          <Download size={14} /> Exportar
        </button>
        <AnimatePresence>
          {exportOpen && (
            <motion.div
              variants={popover}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ transformOrigin: 'top right' }}
              role="menu"
              className="absolute top-8 right-0 z-30 w-56 rounded-[10px] border border-line bg-surface p-1 text-[13px] shadow-xl"
            >
              {(
                [
                  ['md', FileDown, 'Markdown (.md)', 'Texto plano, abre en cualquier editor'],
                  ['pdf', FileType2, 'PDF', 'Con fórmulas y código como se ven acá']
                ] as const
              ).map(([kind, Icon, label, hint]) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport(kind)
                  }}
                  className="flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
                >
                  <Icon size={15} className="mt-0.5 shrink-0 text-fg-muted" />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-[11px] text-fg-subtle">{hint}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
