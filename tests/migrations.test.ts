import { strict as assert } from 'node:assert'
import { cp, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { openDatabase } from '../src/main/db/client'
import { createRepositories } from '../src/main/db/repositories'

const MIGRATIONS = join(import.meta.dirname, '..', 'drizzle')

/** Crea una carpeta de migraciones que solo llega hasta `upTo` (simula una versión vieja de la app). */
async function migrationsUpTo(dir: string, upTo: number) {
  await cp(MIGRATIONS, dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  journal.entries = journal.entries.slice(0, upTo + 1)
  await writeFile(journalPath, JSON.stringify(journal))
}

describe('migración 0001 (carpetas) sobre datos existentes', () => {
  it('conserva documentos, apuntes y anclas; borrar carpeta devuelve los ítems a la raíz', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'sos-mig-'))
    try {
      const old = join(tmp, 'old')
      await migrationsUpTo(old, 0)
      const file = join(tmp, 'db.sqlite')

      // 1) Base creada por la versión anterior (esquema 0000), con datos escritos en SQL directo
      openDatabase(file, old).close()
      const raw0 = new Database(file)
      const s = { id: '11111111-1111-4111-8111-111111111111' }
      const d = { id: '22222222-2222-4222-8222-222222222222' }
      const n = { id: '33333333-3333-4333-8333-333333333333' }
      raw0.prepare(`insert into subjects (id, name) values (?, 'Física')`).run(s.id)
      raw0.prepare(`insert into documents (id, subject_id, title, original_name, storage_path, sha256, size_bytes, page_count) values (?, ?, 'T', 't.pdf', 'x', 'h', 1, 9)`).run(d.id, s.id)
      raw0.prepare(`insert into notes (id, subject_id, document_id, title, content) values (?, ?, ?, 'N', 'hola')`).run(n.id, s.id, d.id)
      raw0.prepare(`insert into pdf_anchors (id, document_id, note_id, kind, page, rects) values ('a1', ?, ?, 'text', 2, '[]')`).run(d.id, n.id)
      raw0.close()

      // 2) Se abre con la versión nueva: aplica 0001 sin perder nada
      const h = openDatabase(file, MIGRATIONS)
      const r = createRepositories(h.db)
      assert.equal(r.documents.get(d.id).folderId, null)
      assert.equal(r.notes.get(n.id).content, 'hola')
      assert.equal(r.anchors.listByDocument(d.id).length, 1)

      // 3) Carpetas: mover y borrar → vuelven a la raíz (ON DELETE SET NULL)
      const f = r.folders.create({ subjectId: s.id, name: 'Teoría', emoji: '🧠' })
      r.documents.move(d.id, f.id)
      r.notes.move(n.id, f.id)
      assert.equal(r.documents.get(d.id).folderId, f.id)
      r.folders.remove(f.id)
      assert.equal(r.documents.get(d.id).folderId, null)
      assert.equal(r.notes.get(n.id).folderId, null)
      assert.equal(r.anchors.listByDocument(d.id).length, 1)
      h.close()

      // La FK quedó con la acción correcta en el esquema real
      const raw = new Database(file, { readonly: true })
      const fk = raw.prepare(`select "table", on_delete from pragma_foreign_key_list('documents') where "table"='folders'`).get() as { on_delete: string }
      assert.equal(fk.on_delete, 'SET NULL')
      raw.close()
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('exportación de apuntes', async () => {
  const { buildMarkdownExport, resolveAnchorLinks, safeFileName } = await import('../src/main/exportFormat')
  it('convierte deep links en referencias legibles y tolera anclas borradas', () => {
    const h = openDatabase(':memory:', MIGRATIONS)
    const r = createRepositories(h.db)
    const s = r.subjects.create({ name: 'AM2' })
    const d = r.documents.create({ subjectId: s.id, title: 'laplace', originalName: 'l.pdf', storagePath: 'x', sha256: 'h', sizeBytes: 1, pageCount: 3 })
    const a = r.anchors.create({ documentId: d.id, kind: 'text', page: 3, rects: [{ x: 0, y: 0, w: 1, h: 0.1 }] })
    const md = `Ver [“Teorema 3” · p. 3](studentos://anchor/${a.id}) y [“viejo” · p. 1](studentos://anchor/00000000-0000-4000-8000-000000000000). [web](https://x.org)`
    assert.equal(resolveAnchorLinks(md, r), 'Ver “Teorema 3” · p. 3 _(laplace)_ y “viejo” · p. 1. [web](https://x.org)')
    h.close()
  })
  it('agrega título y metadatos si el apunte no empieza con un título', () => {
    const out = buildMarkdownExport({ title: 'Resumen', content: 'texto' }, 'AM2', new Date('2026-11-04T10:00:00'))
    assert.match(out, /^# Resumen\n\n> AM2 · 4 de noviembre de 2026\n\ntexto\n$/)
    assert.doesNotMatch(buildMarkdownExport({ title: 'X', content: '# Ya tiene' }, null), /^# X/)
  })
  it('nombres de archivo seguros', () => {
    assert.equal(safeFileName('Apuntes: AM2 / Laplace?'), 'Apuntes AM2 Laplace')
    assert.equal(safeFileName('   '), 'Apunte')
  })
})
