import { strict as assert } from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { openDatabase, type DbHandle } from '../src/main/db/client'
import { createRepositories, type Repositories } from '../src/main/db/repositories'
import { eventCreateSchema, settingsSchemas, subjectCreateSchema } from '../src/shared/validation'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

const MIGRATIONS = join(import.meta.dirname, '..', 'drizzle')
const day = (iso: string) => new Date(`${iso}T10:00:00`)

let h: DbHandle
let r: Repositories

beforeEach(() => {
  h?.close()
  h = openDatabase(':memory:', MIGRATIONS)
  r = createRepositories(h.db)
})

describe('subjects', () => {
  it('crea con defaults, lista ordenado y oculta archivadas', () => {
    const b = r.subjects.create({ name: 'Física II' })
    r.subjects.create({ name: 'Análisis Matemático', difficulty: 5 })
    assert.equal(b.color, '#2a78d6') // primer color libre de la paleta
    assert.equal(b.difficulty, 3)
    assert.ok(b.createdAt instanceof Date)
    assert.ok(Number.isInteger(b.createdAt.getTime()))
    r.subjects.update(b.id, { archived: true })
    assert.deepEqual(r.subjects.list().map((s) => s.name), ['Análisis Matemático'])
    assert.equal(r.subjects.list({ includeArchived: true }).length, 2)
  })

  it('borrar materia: cascada en eventos/documentos/apuntes, pero conserva sesiones (heatmap)', () => {
    const s = r.subjects.create({ name: 'Química' })
    r.events.create({ subjectId: s.id, kind: 'exam', title: 'Parcial', startsAt: day('2026-12-01') })
    const doc = r.documents.create({
      subjectId: s.id, title: 'Apunte', originalName: 'a.pdf', storagePath: 'x/a.pdf',
      sha256: 'abc', sizeBytes: 10, pageCount: 100
    })
    const note = r.notes.create({ subjectId: s.id, documentId: doc.id, title: 'N' })
    r.anchors.create({ documentId: doc.id, noteId: note.id, kind: 'text', page: 3, rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.03 }] })
    const sess = r.sessions.start({ subjectId: s.id, documentId: doc.id })
    r.sessions.finish(sess.id, { activeSeconds: 1200 })

    r.subjects.remove(s.id)

    assert.equal(r.events.upcoming({}, day('2026-01-01')).length, 0)
    assert.equal(r.documents.listBySubject(s.id).length, 0)
    assert.equal(r.anchors.listByDocument(doc.id).length, 0)
    const [kept] = r.sessions.recent()
    assert.equal(kept!.subjectId, null)
    assert.equal(kept!.documentId, null)
    assert.equal(kept!.activeSeconds, 1200)
  })
})

describe('events', () => {
  it('listRange detecta solapamiento; upcoming solo hitos pendientes', () => {
    const s = r.subjects.create({ name: 'Algoritmos' })
    r.events.create({ subjectId: s.id, kind: 'exam', title: 'Parcial 1', startsAt: day('2026-11-10') })
    const tp = r.events.create({ subjectId: s.id, kind: 'assignment', title: 'TP 2', startsAt: day('2026-11-05') })
    r.events.create({ kind: 'other', title: 'Feriado', startsAt: day('2026-11-06') })
    r.events.create({
      kind: 'class', title: 'Clase', startsAt: new Date('2026-11-04T08:00:00'), endsAt: new Date('2026-11-04T12:00:00')
    })

    const range = r.events.listRange({ from: new Date('2026-11-04T11:00:00'), to: new Date('2026-11-04T23:00:00') })
    assert.deepEqual(range.map((e) => e.title), ['Clase'])

    const now = day('2026-11-03')
    assert.deepEqual(r.events.upcoming({}, now).map((e) => e.title), ['TP 2', 'Parcial 1'])
    r.events.update(tp.id, { completedAt: now })
    assert.deepEqual(r.events.upcoming({}, now).map((e) => e.title), ['Parcial 1'])
  })

  it('Google: upsert idempotente y eventos de solo lectura', () => {
    const base = { kind: 'class' as const, title: 'Teórica', startsAt: day('2026-11-04'), externalId: 'g-1' }
    const a = r.events.upsertExternal('google', base)
    const b = r.events.upsertExternal('google', { ...base, title: 'Teórica (Aula 5)' })
    assert.equal(a.id, b.id)
    assert.equal(b.title, 'Teórica (Aula 5)')

    const c = r.events.update(a.id, { title: 'hackeado', completedAt: day('2026-11-04') })
    assert.equal(c.title, 'Teórica (Aula 5)')
    assert.ok(c.completedAt)
  })
})

describe('documents', () => {
  it('trackPage: maxPageRead nunca retrocede', () => {
    const s = r.subjects.create({ name: 'Bio' })
    const d = r.documents.create({
      subjectId: s.id, title: 'T', originalName: 't.pdf', storagePath: 't.pdf', sha256: 'h', sizeBytes: 1, pageCount: 50
    })
    r.documents.trackPage(d.id, 30)
    const back = r.documents.trackPage(d.id, 4)
    assert.equal(back.lastPage, 4)
    assert.equal(back.maxPageRead, 30)
    assert.equal(r.documents.findByHash(s.id, 'h')?.id, d.id)
    assert.throws(() =>
      r.documents.create({
        subjectId: s.id, title: 'dup', originalName: 't.pdf', storagePath: 'u.pdf', sha256: 'h', sizeBytes: 1, pageCount: 50
      })
    )
  })
})

describe('anchors', () => {
  it('guarda rects como JSON y los devuelve tipados', () => {
    const s = r.subjects.create({ name: 'X' })
    const d = r.documents.create({
      subjectId: s.id, title: 'T', originalName: 't.pdf', storagePath: 't.pdf', sha256: 'h', sizeBytes: 1, pageCount: 5
    })
    const rects = [{ x: 0.1, y: 0.1, w: 0.8, h: 0.02 }, { x: 0.1, y: 0.13, w: 0.4, h: 0.02 }]
    const a = r.anchors.create({ documentId: d.id, kind: 'text', page: 2, rects, selectedText: 'Teorema' })
    assert.deepEqual(r.anchors.get(a.id).rects, rects)
  })
})

describe('sessions & check-ins', () => {
  it('corregir, listar y borrar sesiones cerradas', () => {
    const a = r.subjects.create({ name: 'A' })
    const s1 = r.sessions.log({ subjectId: null, minutes: 120, endedAt: new Date('2026-11-01T12:00:00') })
    const s2 = r.sessions.log({ subjectId: a.id, minutes: 30, endedAt: new Date('2026-11-01T18:00:00') })
    const open = r.sessions.start({ subjectId: a.id }, day('2026-11-01'))
    assert.deepEqual(r.sessions.listRange('2026-11-01', '2026-11-01').map((s) => s.id), [s2.id, s1.id]) // sin la abierta
    const fixed = r.sessions.update(s1.id, { activeSeconds: 3600, subjectId: a.id, focusScore: 0.75 })
    assert.equal(fixed.activeSeconds, 3600)
    assert.equal(fixed.focusScore, 0.75)
    r.sessions.remove(s2.id)
    assert.deepEqual(r.sessions.dailyTotals('2026-11-01', '2026-11-01'), [{ localDate: '2026-11-01', seconds: 3600 }])
    assert.equal(r.sessions.active()?.id, open.id)
  })

  it('registrar estudio sin la app: sesión cerrada que suma al día en que empezó', () => {
    const a = r.subjects.create({ name: 'A' })
    const logged = r.sessions.log({ subjectId: a.id, minutes: 60, endedAt: new Date('2026-11-02T00:30:00') })
    assert.equal(logged.activeSeconds, 3600)
    assert.equal(logged.localDate, '2026-11-01') // empezó 23:30 del día anterior
    assert.ok(logged.endedAt)
    assert.equal(r.sessions.active(), undefined) // no queda abierta
    assert.deepEqual(r.sessions.dailyTotals('2026-11-01', '2026-11-30'), [{ localDate: '2026-11-01', seconds: 3600 }])
  })

  it('una sola sesión activa; totales por día y por materia', () => {
    const a = r.subjects.create({ name: 'A' })
    const b = r.subjects.create({ name: 'B' })
    const s1 = r.sessions.start({ subjectId: a.id }, day('2026-11-01'))
    r.sessions.start({ subjectId: b.id }, day('2026-11-01')) // cierra s1 automáticamente
    assert.equal(r.sessions.active()?.subjectId, b.id)
    r.sessions.finish(r.sessions.active()!.id, { activeSeconds: 600 })
    r.sessions.heartbeat(s1.id, 900)
    const s3 = r.sessions.start({ subjectId: a.id }, day('2026-11-02'))
    r.sessions.finish(s3.id, { activeSeconds: 300 })
    assert.equal(r.sessions.active(), undefined)

    assert.deepEqual(r.sessions.dailyTotals('2026-11-01', '2026-11-30'), [
      { localDate: '2026-11-01', seconds: 1500 },
      { localDate: '2026-11-02', seconds: 300 }
    ])
    assert.deepEqual(
      r.sessions.totalsBySubject('2026-11-01', '2026-11-30').map((t) => [t.name, t.seconds]),
      [['A', 1200], ['B', 600]]
    )
  })

  it('check-in del día', () => {
    const now = day('2026-11-03')
    assert.equal(r.checkIns.latestForDay('2026-11-03'), undefined)
    r.checkIns.create({ energy: 'high' }, now)
    assert.equal(r.checkIns.latestForDay('2026-11-03')?.energy, 'high')
  })
})

describe('settings', () => {
  it('defaults + override persistido', () => {
    assert.deepEqual(r.settings.getAll(), DEFAULT_SETTINGS)
    r.settings.set('theme', 'arcade')
    r.settings.set('theme', 'focus')
    assert.equal(r.settings.get('theme'), 'focus')
    assert.equal(r.settings.getAll().pomodoro.focusMinutes, 50)
  })
})

describe('validación IPC', () => {
  it('rechaza entradas inválidas', () => {
    assert.equal(subjectCreateSchema.safeParse({ name: '  ' }).success, false)
    assert.equal(subjectCreateSchema.safeParse({ name: 'Ok', color: 'red' }).success, false)
    assert.equal(
      eventCreateSchema.safeParse({ kind: 'exam', title: 'P', startsAt: day('2026-11-10'), endsAt: day('2026-11-09') }).success,
      false
    )
    assert.equal(eventCreateSchema.safeParse({ kind: 'party', title: 'P', startsAt: new Date() }).success, false)
    assert.equal(settingsSchemas.theme.safeParse('neon').success, false)
  })
})
