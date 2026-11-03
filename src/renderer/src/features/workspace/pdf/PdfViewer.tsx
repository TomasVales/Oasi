import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { popover as popoverMotion } from '@/lib/motion'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Loader2,
  MoveHorizontal,
  NotebookPen,
  ListCollapse,
  Sparkles,
  SquareDashedMousePointer,
  SunMoon,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { NormalizedRect } from '@shared/domain'
import type { DocumentRecord, PdfAnchor } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { usePersistentState } from '@/hooks/usePersistentState'
import { writeDraftToDataTransfer, type AnchorDraft } from '../anchorDraft'
import { openPdf, type PDFDocumentLoadingTask } from './pdfjs'
import { draftFromArea, draftFromTextSelection, normalizeRect, pageContentBox } from './selection'
import { EventBus, PDFLinkService, PDFViewer } from './viewerLib'

export interface FocusRequest {
  anchor: PdfAnchor
  /** Cambia en cada pedido para volver a saltar aunque sea la misma ancla. */
  nonce: number
}

interface Props {
  document: DocumentRecord
  anchors: PdfAnchor[]
  focus: FocusRequest | null
  onPageChange: (page: number) => void
  onInsertDraft: (draft: AnchorDraft) => void
  /** Pedido a la IA sobre la selección (simplificar / resumir). */
  onAiRequest?: (task: 'simplify' | 'summarize', draft: AnchorDraft) => void
  /** Acciones extra en el menú de selección. */
  selectionActions?: (draft: AnchorDraft, close: () => void) => ReactNode
}

interface ContextMenu {
  draft: AnchorDraft
  x: number
  y: number
}

interface Popover {
  draft: AnchorDraft
  x: number
  y: number
}

const MIN_SCALE = 0.3
const MAX_SCALE = 5

export function PdfViewer({ document: doc, anchors, focus, onPageChange, onInsertDraft, onAiRequest, selectionActions }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerElRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PDFViewer | null>(null)
  const readyRef = useRef(false)
  const fitWidthRef = useRef(true)
  const pendingFocusRef = useRef<FocusRequest | null>(null)
  const areaDraftElRef = useRef<HTMLElement | null>(null)

  // Refs con el último valor para usarlos desde callbacks de pdf.js sin recrear el visor.
  const anchorsRef = useRef(anchors)
  const activeAnchorRef = useRef<string | null>(null)
  const onPageChangeRef = useRef(onPageChange)
  onPageChangeRef.current = onPageChange

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [numPages, setNumPages] = useState(doc.pageCount)
  const [scale, setScale] = useState(1)
  const [areaMode, setAreaMode] = useState(false)
  const [invert, setInvert] = usePersistentState('pdf.invert', false)
  const [popover, setPopover] = useState<Popover | null>(null)
  const [menu, setMenu] = useState<ContextMenu | null>(null)

  // ─── Resaltados de anclas ────────────────────────────────────────────────
  const paintPage = useCallback((pageNumber: number) => {
    const div: HTMLElement | undefined = viewerRef.current?.getPageView(pageNumber - 1)?.div
    if (!div) return
    div.querySelectorAll('.sos-hl').forEach((el) => el.remove())
    for (const a of anchorsRef.current) {
      if (a.page !== pageNumber) continue
      for (const r of a.rects) {
        const el = window.document.createElement('div')
        el.className = cn('sos-hl', a.kind === 'area' && 'sos-hl--area', a.id === activeAnchorRef.current && 'sos-hl--active')
        el.style.left = `${r.x * 100}%`
        el.style.top = `${r.y * 100}%`
        el.style.width = `${r.w * 100}%`
        el.style.height = `${r.h * 100}%`
        el.title = a.selectedText ?? 'Recorte enlazado desde un apunte'
        div.appendChild(el)
      }
    }
  }, [])

  const paintAll = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    for (let i = 1; i <= v.pagesCount; i++) paintPage(i)
  }, [paintPage])

  useEffect(() => {
    anchorsRef.current = anchors
    paintAll()
  }, [anchors, paintAll])

  // ─── Saltar a un ancla ───────────────────────────────────────────────────
  const jumpTo = useCallback(
    (req: FocusRequest) => {
      const v = viewerRef.current
      const container = containerRef.current
      if (!v || !container || !readyRef.current) {
        pendingFocusRef.current = req
        return
      }
      const { anchor } = req
      activeAnchorRef.current = anchor.id
      // Si el ancla aún no estaba en la lista (recién creada), se pinta igual.
      if (!anchorsRef.current.some((a) => a.id === anchor.id)) anchorsRef.current = [...anchorsRef.current, anchor]

      const pageView = v.getPageView(anchor.page - 1)
      const div: HTMLElement | undefined = pageView?.div
      if (!div) return
      const top = Math.min(...anchor.rects.map((r) => r.y))
      const cRect = container.getBoundingClientRect()
      const dRect = div.getBoundingClientRect()
      const y = container.scrollTop + (dRect.top - cRect.top) + top * dRect.height - container.clientHeight * 0.25
      container.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
      paintPage(anchor.page)
    },
    [paintPage]
  )

  useEffect(() => {
    if (focus && focus.anchor.documentId === doc.id) jumpTo(focus)
  }, [focus, doc.id, jumpTo])

  // ─── Ciclo de vida del visor ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current!
    const viewerEl = viewerElRef.current!
    readyRef.current = false
    setStatus('loading')
    setError(null)
    setPopover(null)

    const eventBus = new EventBus()
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 /* BLANK → navegador del sistema */ })
    const viewer = new PDFViewer({ container, viewer: viewerEl, eventBus, linkService, removePageBorders: true })
    linkService.setViewer(viewer)
    viewerRef.current = viewer

    eventBus.on('pagesinit', () => {
      viewer.currentScaleValue = 'page-width'
      fitWidthRef.current = true
      readyRef.current = true
      setStatus('ready')
      const pending = pendingFocusRef.current
      pendingFocusRef.current = null
      if (pending && pending.anchor.documentId === doc.id) {
        // Se espera un frame para que pdf.js termine de maquetar las páginas.
        requestAnimationFrame(() => jumpTo(pending))
      } else if (doc.lastPage > 1) {
        viewer.currentPageNumber = Math.min(doc.lastPage, viewer.pagesCount)
      }
    })
    eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      setPage(pageNumber)
      setPageInput(String(pageNumber))
      onPageChangeRef.current(pageNumber)
    })
    eventBus.on('scalechanging', ({ scale }: { scale: number }) => setScale(scale))
    // pdf.js recrea el contenido de las páginas al hacer zoom o al reciclarlas: se repintan las anclas.
    eventBus.on('pagerendered', ({ pageNumber }: { pageNumber: number }) => paintPage(pageNumber))
    eventBus.on('textlayerrendered', ({ pageNumber }: { pageNumber: number }) => paintPage(pageNumber))

    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    api.documents
      .read(doc.id)
      .then((data) => {
        if (cancelled) return null
        task = openPdf(data)
        return task.promise
      })
      .then((pdf) => {
        if (cancelled || !pdf) return
        setNumPages(pdf.numPages)
        viewer.setDocument(pdf)
        linkService.setDocument(pdf, null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      })

    const ro = new ResizeObserver(() => {
      if (readyRef.current && fitWidthRef.current) viewer.currentScaleValue = 'page-width'
    })
    ro.observe(container)

    return () => {
      cancelled = true
      ro.disconnect()
      readyRef.current = false
      viewerRef.current = null
      viewer.setDocument(null as never)
      linkService.setDocument(null, null)
      void (task as PDFDocumentLoadingTask | null)?.destroy()
      viewerEl.replaceChildren()
    }
    // El visor se recrea solo al cambiar de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // ─── Zoom ────────────────────────────────────────────────────────────────
  const zoom = useCallback((factor: number) => {
    const v = viewerRef.current
    if (!v) return
    fitWidthRef.current = false
    v.currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.currentScale * factor))
  }, [])

  const fitWidth = () => {
    const v = viewerRef.current
    if (!v) return
    fitWidthRef.current = true
    v.currentScaleValue = 'page-width'
  }

  // Ctrl/⌘ + rueda = zoom (requiere listener no pasivo para poder cancelar el scroll).
  useEffect(() => {
    const el = containerRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom])

  const goToPage = (n: number) => {
    const v = viewerRef.current
    if (!v || Number.isNaN(n)) return
    v.currentPageNumber = Math.min(Math.max(1, Math.round(n)), v.pagesCount)
  }

  // ─── Selección de texto → menú flotante ──────────────────────────────────
  const closePopover = useCallback(() => {
    setPopover(null)
    setMenu(null)
    areaDraftElRef.current?.remove()
    areaDraftElRef.current = null
  }, [])

  const placePopover = (draft: AnchorDraft, clientX: number, clientY: number) => {
    const w = wrapperRef.current!.getBoundingClientRect()
    setPopover({ draft, x: Math.min(clientX - w.left, w.width - 280), y: Math.min(clientY - w.top + 8, w.height - 60) })
  }

  const onMouseUp = () => {
    if (areaMode) return
    // Se difiere un tick: la selección del navegador se actualiza después del mouseup.
    setTimeout(() => {
      const draft = draftFromTextSelection(containerRef.current!, doc.id)
      if (!draft) {
        setPopover(null)
        return
      }
      const rects = window.getSelection()!.getRangeAt(0).getClientRects()
      const last = rects[rects.length - 1]
      if (last) placePopover(draft, last.right, last.bottom)
    }, 0)
  }

  const onDragStart = (e: React.DragEvent) => {
    // Arrastre nativo del texto seleccionado: se adjunta el ancla al dataTransfer.
    const draft = popover?.draft ?? draftFromTextSelection(containerRef.current!, doc.id)
    if (draft) writeDraftToDataTransfer(e.dataTransfer, draft)
  }

  // ─── Recorte de área ─────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (!areaMode || e.button !== 0) return
    const pageEl = (e.target as Element).closest<HTMLElement>('.page[data-page-number]')
    if (!pageEl) return
    e.preventDefault()
    closePopover()
    const box = pageContentBox(pageEl)
    const start = { x: e.clientX, y: e.clientY }
    const el = window.document.createElement('div')
    el.className = 'sos-area-draft'
    pageEl.appendChild(el)
    areaDraftElRef.current = el

    let rect: NormalizedRect = { x: 0, y: 0, w: 0, h: 0 }
    const move = (ev: MouseEvent) => {
      rect = normalizeRect(
        {
          left: Math.min(start.x, ev.clientX),
          top: Math.min(start.y, ev.clientY),
          right: Math.max(start.x, ev.clientX),
          bottom: Math.max(start.y, ev.clientY)
        },
        box
      )
      Object.assign(el.style, {
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`
      })
    }
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (rect.w < 0.01 || rect.h < 0.01) {
        closePopover()
        return
      }
      placePopover(draftFromArea(pageEl, doc.id, rect), ev.clientX, ev.clientY)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover()
        setAreaMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePopover])

  // Clic derecho sobre una selección: menú con las acciones (incluida la IA).
  const onContextMenu = (e: React.MouseEvent) => {
    const draft = popover?.draft ?? draftFromTextSelection(containerRef.current!, doc.id)
    if (!draft) return // sin selección: menú nativo (no hace nada en Electron)
    e.preventDefault()
    const w = wrapperRef.current!.getBoundingClientRect()
    setPopover(null)
    setMenu({ draft, x: Math.min(e.clientX - w.left, w.width - 230), y: Math.min(e.clientY - w.top, w.height - 190) })
  }

  const askAi = (task: 'simplify' | 'summarize', draft: AnchorDraft) => {
    onAiRequest?.(task, draft)
    setMenu(null)
    setPopover(null)
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const insert = (draft: AnchorDraft) => {
    onInsertDraft(draft)
    window.getSelection()?.removeAllRanges()
    closePopover()
  }

  return (
    <div ref={wrapperRef} className="relative flex h-full min-w-0 flex-col">
      {/* Barra del visor */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 text-xs">
        <ToolButton title="Página anterior" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={15} />
        </ToolButton>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            goToPage(Number(pageInput))
          }}
          className="flex items-center gap-1 text-fg-muted"
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageInput(String(page))}
            aria-label="Página"
            className="h-6 w-10 rounded border border-line bg-canvas text-center text-fg tabular-nums focus:border-accent focus:outline-none"
          />
          <span className="tabular-nums">/ {numPages}</span>
        </form>
        <ToolButton title="Página siguiente" onClick={() => goToPage(page + 1)} disabled={page >= numPages}>
          <ChevronRight size={15} />
        </ToolButton>

        <span className="mx-1.5 h-4 w-px bg-line" />
        <ToolButton title="Alejar (⌘ + rueda)" onClick={() => zoom(1 / 1.15)}>
          <ZoomOut size={15} />
        </ToolButton>
        <span className="w-10 text-center text-fg-muted tabular-nums">{Math.round(scale * 100)}%</span>
        <ToolButton title="Acercar (⌘ + rueda)" onClick={() => zoom(1.15)}>
          <ZoomIn size={15} />
        </ToolButton>
        <ToolButton title="Ajustar al ancho" onClick={fitWidth}>
          <MoveHorizontal size={15} />
        </ToolButton>

        <span className="flex-1" />
        <ToolButton
          title="Recortar área (figuras, fórmulas). Esc para salir"
          active={areaMode}
          onClick={() => {
            closePopover()
            setAreaMode((v) => !v)
          }}
        >
          <SquareDashedMousePointer size={15} />
        </ToolButton>
        <ToolButton title="Invertir colores del PDF (lectura nocturna)" active={invert} onClick={() => setInvert((v) => !v)}>
          <SunMoon size={15} />
        </ToolButton>
      </div>

      {/* Área de páginas: pdf.js exige un contenedor con posición absoluta */}
      <div className="relative min-h-0 flex-1 bg-surface-2">
        <div
          ref={containerRef}
          className={cn('sos-pdf absolute inset-0 overflow-auto', invert && 'sos-pdf--invert', areaMode && 'sos-pdf--area')}
          onMouseUp={onMouseUp}
          onMouseDown={onMouseDown}
          onDragStart={onDragStart}
          onContextMenu={onContextMenu}
          onScroll={() => (popover || menu) && closePopover()}
        >
          <div ref={viewerElRef} className="pdfViewer" />
        </div>

        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-fg-subtle">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-danger">
            No se pudo abrir el PDF: {error}
          </div>
        )}
      </div>

      <AnimatePresence>
      {popover && (
        <motion.div
          key="sel-popover"
          variants={popoverMotion}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ left: Math.max(8, popover.x), top: popover.y, transformOrigin: 'top left' }}
          role="toolbar"
          aria-label="Acciones de la selección"
          className="absolute z-20 flex items-center gap-0.5 rounded-card border border-line bg-surface p-1 shadow-lg arcade:shadow-glow"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div
            draggable
            onDragStart={(e) => writeDraftToDataTransfer(e.dataTransfer, popover.draft)}
            onDragEnd={closePopover}
            title="Arrastrá al apunte para crear un enlace a esta posición"
            className="flex h-7 cursor-grab items-center gap-1 rounded px-1.5 text-xs text-fg-muted hover:bg-surface-2 active:cursor-grabbing"
          >
            <GripVertical size={14} /> Arrastrar
          </div>
          <PopoverButton onClick={() => insert(popover.draft)}>
            <NotebookPen size={13} /> Insertar en apunte
          </PopoverButton>
          {popover.draft.selectedText && (
            <PopoverButton
              onClick={() => {
                void navigator.clipboard.writeText(popover.draft.selectedText ?? '')
                closePopover()
              }}
            >
              <Copy size={13} /> Copiar
            </PopoverButton>
          )}
          {onAiRequest && popover.draft.selectedText && (
            <PopoverButton onClick={() => askAi('simplify', popover.draft)}>
              <Sparkles size={13} className="text-accent-2" /> Simplificar
            </PopoverButton>
          )}
          {selectionActions?.(popover.draft, closePopover)}
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {menu && (
        <motion.div
          key="ctx-menu"
          variants={popoverMotion}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="menu"
          aria-label="Acciones sobre la selección"
          className="absolute z-30 w-56 rounded-[8px] border border-line bg-surface p-1.5 text-[13px] shadow-xl arcade:shadow-glow"
          style={{ left: Math.max(8, menu.x), top: menu.y, transformOrigin: 'top left' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onAiRequest && menu.draft.selectedText && (
            <>
              <MenuItem onClick={() => askAi('simplify', menu.draft)} icon={<Sparkles size={14} className="text-accent-2" />}>
                Simplificar con IA
              </MenuItem>
              <MenuItem onClick={() => askAi('summarize', menu.draft)} icon={<ListCollapse size={14} className="text-accent-2" />}>
                Resumir con IA
              </MenuItem>
              <div className="my-1 h-px bg-line" />
            </>
          )}
          <MenuItem onClick={() => insert(menu.draft)} icon={<NotebookPen size={14} />}>
            Insertar en apunte
          </MenuItem>
          {menu.draft.selectedText && (
            <MenuItem
              onClick={() => {
                void navigator.clipboard.writeText(menu.draft.selectedText ?? '')
                closePopover()
              }}
              icon={<Copy size={14} />}
            >
              Copiar
            </MenuItem>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

function ToolButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40',
        active && 'bg-accent-soft text-accent',
        className
      )}
      {...props}
    />
  )
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-[5px] px-2 text-left text-fg hover:bg-accent hover:text-accent-fg [&_svg]:shrink-0 hover:[&_svg]:text-current"
    >
      {icon}
      {children}
    </button>
  )
}

export function PopoverButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-fg hover:bg-surface-2"
      {...props}
    />
  )
}
