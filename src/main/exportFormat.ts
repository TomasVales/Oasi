import type { Repositories } from './db/repositories'

/** Funciones puras de exportación (sin Electron: se testean con Node). */
const ANCHOR_LINK = /\[([^\]]*)\]\(studentos:\/\/anchor\/([0-9a-f-]{36})\)/gi

/** Nombre de archivo seguro a partir del título del apunte. */
export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Apunte'
}

/**
 * Los deep links (studentos://anchor/…) no funcionan fuera de la app: se convierten en texto
 * con la referencia al PDF, p. ej. “Teorema 3” · p. 3 _(laplace)_.
 */
export function resolveAnchorLinks(markdown: string, repos: Repositories): string {
  return markdown.replace(ANCHOR_LINK, (_m, label: string, anchorId: string) => {
    try {
      const anchor = repos.anchors.get(anchorId)
      const doc = repos.documents.get(anchor.documentId)
      return `${label} _(${doc.title})_`
    } catch {
      return label // ancla o documento borrados: queda solo el texto
    }
  })
}

export function buildMarkdownExport(note: { title: string; content: string }, subjectName: string | null, now = new Date()): string {
  const body = note.content.trim()
  const startsWithTitle = /^#\s/.test(body)
  const meta = [subjectName, now.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · ')
  return `${startsWithTitle ? '' : `# ${note.title}\n\n`}> ${meta}\n\n${body}\n`
}

