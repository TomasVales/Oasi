import { createHash } from 'node:crypto'
import { copyFile, mkdir, open, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

export const MAX_BACKGROUND_BYTES = 30 * 1024 * 1024

const FORMATS = [
  { ext: 'png', mime: 'image/png', test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: (b: Buffer) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  { ext: 'webp', mime: 'image/webp', test: (b: Buffer) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'avif', mime: 'image/avif', test: (b: Buffer) => b.subarray(4, 8).toString('ascii') === 'ftyp' && ['avif', 'avis'].includes(b.subarray(8, 12).toString('ascii')) }
] as const

export interface StoredBackground {
  fileName: string
  mime: string
  sizeBytes: number
  originalName: string
}

const NAME_RE = /^[0-9a-f]{64}\.(png|jpg|gif|webp|avif)$/

/**
 * Fondo personalizado: se guarda UNA imagen o GIF en userData/backgrounds, con nombre = hash.
 * El formato se valida por su firma (los primeros bytes), no por la extensión.
 */
export class BackgroundStore {
  constructor(private readonly dir: string) {}

  async import(sourcePath: string): Promise<StoredBackground> {
    const info = await stat(sourcePath).catch(() => null)
    if (!info?.isFile()) throw new Error('No se encontró la imagen')
    if (info.size > MAX_BACKGROUND_BYTES) throw new Error('La imagen supera los 30 MB')
    const fh = await open(sourcePath, 'r')
    const head = Buffer.alloc(16)
    try {
      await fh.read(head, 0, 16, 0)
    } finally {
      await fh.close()
    }
    const format = FORMATS.find((f) => f.test(head))
    if (!format) throw new Error('Formato no soportado: usá PNG, JPG, GIF, WebP o AVIF')

    const hash = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
    const fileName = `${hash}.${format.ext}`
    await mkdir(this.dir, { recursive: true })
    await copyFile(sourcePath, join(this.dir, fileName))
    // Solo se conserva el fondo actual.
    for (const f of await readdir(this.dir)) if (f !== fileName) await rm(join(this.dir, f), { force: true })
    return { fileName, mime: format.mime, sizeBytes: info.size, originalName: basename(sourcePath) }
  }

  async read(fileName: string): Promise<Uint8Array> {
    if (!NAME_RE.test(fileName)) throw new Error('Nombre de fondo inválido')
    return new Uint8Array(await readFile(join(this.dir, fileName)))
  }

  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true })
  }
}
