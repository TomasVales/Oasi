import type { AnchorKind, NormalizedRect } from '@shared/domain'

/** Selección del PDF lista para convertirse en deep link (aún no guardada en la DB). */
export interface AnchorDraft {
  documentId: string
  kind: AnchorKind
  page: number
  rects: NormalizedRect[]
  selectedText: string | null
}

/** Tipo MIME propio del drag & drop PDF → editor. */
export const ANCHOR_MIME = 'application/x-studentos-anchor'

export const ANCHOR_HREF_PREFIX = 'studentos://anchor/'

export const anchorHref = (id: string) => `${ANCHOR_HREF_PREFIX}${id}`

export function anchorIdFromHref(href: string | null | undefined): string | null {
  if (!href?.startsWith(ANCHOR_HREF_PREFIX)) return null
  const id = href.slice(ANCHOR_HREF_PREFIX.length)
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/**
 * Texto visible del enlace en el apunte. Se quitan caracteres con significado en Markdown
 * ([ ] $ * _ ` < > \) para que el archivo vuelva a leerse exactamente igual.
 */
export function anchorLabel(d: Pick<AnchorDraft, 'kind' | 'page' | 'selectedText'>): string {
  if (d.kind === 'area' || !d.selectedText) return `Recorte · p. ${d.page}`
  const clean = d.selectedText.replace(/[[\]$*_`<>\\]/g, '').replace(/\s+/g, ' ').trim()
  const short = clean.length > 70 ? `${clean.slice(0, 67).trimEnd()}…` : clean
  return `“${short}” · p. ${d.page}`
}

export function writeDraftToDataTransfer(dt: DataTransfer, draft: AnchorDraft) {
  dt.setData(ANCHOR_MIME, JSON.stringify(draft))
  dt.setData('text/plain', draft.selectedText ?? '')
  dt.effectAllowed = 'copy'
}

export function readDraftFromDataTransfer(dt: DataTransfer | null): AnchorDraft | null {
  const raw = dt?.getData(ANCHOR_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AnchorDraft
  } catch {
    return null
  }
}
