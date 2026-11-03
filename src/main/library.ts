import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, readFile, rm, stat, unlink } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { DocumentRecord } from '@shared/models'
import type { Repositories } from './db/repositories'

const MAX_PDF_BYTES = 500 * 1024 * 1024

export interface ImportResult {
  document: DocumentRecord
  /** true si ese mismo archivo (mismo hash) ya estaba en la materia: no se copia de nuevo. */
  duplicate: boolean
}

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Promise<Pdfjs> | null = null
/** pdf.js es ESM-only: se carga bajo demanda y una sola vez. */
const loadPdfjs = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs'))

async function countPages(data: Uint8Array): Promise<number> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data, disableFontFace: true, verbosity: 0 })
  try {
    const doc = await task.promise
    return doc.numPages
  } finally {
    await task.destroy()
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Comprueba la firma %PDF- en el primer KB (algunos PDFs traen basura antes del encabezado). */
async function looksLikePdf(path: string): Promise<boolean> {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(1024)
    const { bytesRead } = await fh.read(buf, 0, 1024, 0)
    return buf.subarray(0, bytesRead).includes('%PDF-')
  } finally {
    await fh.close()
  }
}

function titleFromFilename(file: string): string {
  return basename(file, extname(file)).replace(/[_]+/g, ' ').trim() || 'Documento'
}

/**
 * Biblioteca local de PDFs: userData/library/<subjectId>/<documentId>.pdf
 * La DB guarda rutas relativas a esta raíz, así la carpeta de datos es portable.
 */
export class Library {
  constructor(
    private readonly root: string,
    private readonly repos: Repositories
  ) {}

  private abs(storagePath: string): string {
    return join(this.root, storagePath)
  }

  async importPdf(subjectId: string, sourcePath: string, folderId: string | null = null): Promise<ImportResult> {
    this.repos.subjects.get(subjectId) // lanza si la materia no existe
    this.repos.folders.assertInSubject(folderId, subjectId)

    if (!isAbsolute(sourcePath)) throw new Error('La ruta del archivo debe ser absoluta')
    const info = await stat(sourcePath).catch(() => null)
    if (!info?.isFile()) throw new Error(`No se encontró el archivo: ${basename(sourcePath)}`)
    if (info.size > MAX_PDF_BYTES) throw new Error('El PDF supera el máximo de 500 MB')
    if (!(await looksLikePdf(sourcePath))) throw new Error(`${basename(sourcePath)} no es un PDF válido`)

    const sha256 = await sha256File(sourcePath)
    const existing = this.repos.documents.findByHash(subjectId, sha256)
    if (existing) {
      // Mismo archivo ya importado: si se soltó en otra carpeta, se mueve ahí.
      const document = folderId !== null && existing.folderId !== folderId ? this.repos.documents.move(existing.id, folderId) : existing
      return { document, duplicate: true }
    }

    const pageCount = await countPages(new Uint8Array(await readFile(sourcePath)))

    const id = randomUUID()
    const storagePath = `${subjectId}/${id}.pdf`
    await mkdir(join(this.root, subjectId), { recursive: true })
    await copyFile(sourcePath, this.abs(storagePath))

    try {
      const document = this.repos.documents.create({
        id,
        subjectId,
        folderId,
        title: titleFromFilename(sourcePath),
        originalName: basename(sourcePath),
        storagePath,
        sha256,
        sizeBytes: info.size,
        pageCount
      })
      return { document, duplicate: false }
    } catch (err) {
      await unlink(this.abs(storagePath)).catch(() => {})
      throw err
    }
  }

  async read(documentId: string): Promise<Uint8Array> {
    const doc = this.repos.documents.get(documentId)
    return new Uint8Array(await readFile(this.abs(doc.storagePath)))
  }

  async removeDocument(documentId: string): Promise<void> {
    const row = this.repos.documents.remove(documentId)
    if (row) await rm(this.abs(row.storagePath), { force: true })
  }

  /** Borra la carpeta de la materia. Llamar junto con el borrado de la materia en la DB. */
  async removeSubjectFiles(subjectId: string): Promise<void> {
    await rm(join(this.root, subjectId), { recursive: true, force: true })
  }
}
