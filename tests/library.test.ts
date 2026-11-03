import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { openDatabase, type DbHandle } from '../src/main/db/client'
import { createRepositories, type Repositories } from '../src/main/db/repositories'
import { Library } from '../src/main/library'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'laplace.pdf')
const MIGRATIONS = join(import.meta.dirname, '..', 'drizzle')

let h: DbHandle
let r: Repositories
let root: string
let lib: Library

beforeEach(async () => {
  h = openDatabase(':memory:', MIGRATIONS)
  r = createRepositories(h.db)
  root = await mkdtemp(join(tmpdir(), 'sos-lib-'))
  lib = new Library(join(root, 'library'), r)
})

afterEach(async () => {
  h.close()
  await rm(root, { recursive: true, force: true })
})

describe('Library', () => {
  it('importa: copia, cuenta páginas, hashea; el mismo archivo es duplicado', async () => {
    const s = r.subjects.create({ name: 'Análisis' })
    const { document: d, duplicate } = await lib.importPdf(s.id, FIXTURE)
    assert.equal(duplicate, false)
    assert.equal(d.pageCount, 12)
    assert.equal(d.title, 'laplace')
    assert.match(d.sha256, /^[0-9a-f]{64}$/)
    assert.equal(d.storagePath, `${s.id}/${d.id}.pdf`)
    assert.ok(existsSync(join(root, 'library', d.storagePath)))

    const bytes = await lib.read(d.id)
    assert.equal(bytes.byteLength, d.sizeBytes)

    const again = await lib.importPdf(s.id, FIXTURE)
    assert.equal(again.duplicate, true)
    assert.equal(again.document.id, d.id)
  })

  it('rechaza rutas relativas, archivos inexistentes y no-PDF', async () => {
    const s = r.subjects.create({ name: 'X' })
    await assert.rejects(lib.importPdf(s.id, 'relativo.pdf'), /absoluta/)
    await assert.rejects(lib.importPdf(s.id, join(root, 'nope.pdf')), /No se encontró/)
    const fake = join(root, 'falso.pdf')
    await writeFile(fake, 'no soy un pdf')
    await assert.rejects(lib.importPdf(s.id, fake), /no es un PDF/)
  })

  it('borrar documento y materia limpia los archivos', async () => {
    const s = r.subjects.create({ name: 'Y' })
    const { document: d } = await lib.importPdf(s.id, FIXTURE)
    const file = join(root, 'library', d.storagePath)
    await lib.removeDocument(d.id)
    assert.equal(existsSync(file), false)
    assert.equal(r.documents.listBySubject(s.id).length, 0)

    await lib.importPdf(s.id, FIXTURE)
    await lib.removeSubjectFiles(s.id)
    assert.equal(existsSync(join(root, 'library', s.id)), false)
  })
})
