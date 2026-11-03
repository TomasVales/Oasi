import type { NormalizedRect } from '@shared/domain'
import type { AnchorDraft } from '../anchorDraft'

/**
 * Elemento que cubre exactamente el contenido de la página (sin bordes):
 * todas las coordenadas normalizadas se calculan contra él.
 */
export function pageContentBox(pageEl: HTMLElement): DOMRect {
  return (pageEl.querySelector('.canvasWrapper') ?? pageEl).getBoundingClientRect()
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function normalizeRect(r: { left: number; top: number; right: number; bottom: number }, box: DOMRect): NormalizedRect {
  const x0 = clamp01((r.left - box.left) / box.width)
  const y0 = clamp01((r.top - box.top) / box.height)
  const x1 = clamp01((r.right - box.left) / box.width)
  const y1 = clamp01((r.bottom - box.top) / box.height)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * pdf.js genera un span por fragmento de texto: una línea seleccionada produce
 * varios rectángulos. Se unen los de la misma línea para guardar pocos y limpios.
 */
export function mergeLineRects(rects: NormalizedRect[]): NormalizedRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: NormalizedRect[] = []
  for (const r of sorted) {
    const last = lines.at(-1)
    const sameLine = last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.max(last.h, r.h) * 0.5
    if (last && sameLine) {
      const x0 = Math.min(last.x, r.x)
      const y0 = Math.min(last.y, r.y)
      const x1 = Math.max(last.x + last.w, r.x + r.w)
      const y1 = Math.max(last.y + last.h, r.y + r.h)
      Object.assign(last, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
    } else {
      lines.push({ ...r })
    }
  }
  return lines
}

const round = (r: NormalizedRect): NormalizedRect => ({
  x: +r.x.toFixed(5),
  y: +r.y.toFixed(5),
  w: +r.w.toFixed(5),
  h: +r.h.toFixed(5)
})

/** Convierte la selección de texto actual (dentro de `container`) en un borrador de ancla. */
export function draftFromTextSelection(container: HTMLElement, documentId: string): AnchorDraft | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null

  const startNode = range.startContainer
  const startEl = startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement
  const pageEl = startEl?.closest<HTMLElement>('.page[data-page-number]')
  if (!pageEl) return null

  const box = pageContentBox(pageEl)
  const raw = [...range.getClientRects()].filter(
    (r) =>
      r.width > 1 &&
      r.height > 1 &&
      r.height < box.height * 0.2 && // descarta el div .endOfContent que pdf.js estira al seleccionar
      r.bottom > box.top &&
      r.top < box.bottom
  )
  // Una selección que cruza páginas se ancla a la página donde empieza.
  const rects = mergeLineRects(raw.map((r) => normalizeRect(r, box)))
    .filter((r) => r.w > 0.002 && r.h > 0.002)
    .map(round)
  const text = sel.toString().replace(/\s+/g, ' ').trim()
  if (!rects.length || !text) return null

  return { documentId, kind: 'text', page: Number(pageEl.dataset['pageNumber']), rects, selectedText: text }
}

/** Texto de la capa de texto que cae dentro de un recorte (sirve como contexto para la IA). */
export function textInsideArea(pageEl: HTMLElement, area: NormalizedRect): string {
  const box = pageContentBox(pageEl)
  const parts: string[] = []
  pageEl.querySelectorAll<HTMLElement>('.textLayer span').forEach((span) => {
    const r = span.getBoundingClientRect()
    const cx = (r.left + r.width / 2 - box.left) / box.width
    const cy = (r.top + r.height / 2 - box.top) / box.height
    if (cx >= area.x && cx <= area.x + area.w && cy >= area.y && cy <= area.y + area.h) parts.push(span.textContent ?? '')
  })
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function draftFromArea(pageEl: HTMLElement, documentId: string, area: NormalizedRect): AnchorDraft {
  const text = textInsideArea(pageEl, area)
  return {
    documentId,
    kind: 'area',
    page: Number(pageEl.dataset['pageNumber']),
    rects: [round(area)],
    selectedText: text || null
  }
}
