import { strict as assert } from 'node:assert'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { openDatabase } from '../src/main/db/client'
import { createRepositories, type Repositories } from '../src/main/db/repositories'
import { recalculatePlan, todayPlan } from '../src/main/planning'
import { evaluatePlan, debtBySubject } from '../src/shared/planProgress'
import type { PlannedBlock } from '../src/shared/planner'

const MIGRATIONS = join(import.meta.dirname, '..', 'drizzle')
const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m)

const block = (subjectId: string, h: number, minutes = 50): PlannedBlock => ({
  subjectId,
  start: at(h),
  end: new Date(at(h).getTime() + minutes * 60_000),
  minutes,
  mode: 'profundo',
  load: 4,
  milestone: null,
  document: null,
  reasons: [],
  score: 1
})

describe('progreso del plan', () => {
  it('cumplido con 60 %, en curso, pendiente y atrasado; la deuda es lo que faltó', () => {
    const blocks = [block('a', 9), block('b', 10), block('a', 11), block('b', 12)]
    const sessions = [
      { subjectId: 'a', startedAt: at(9, 5), activeSeconds: 32 * 60 }, // 32/50 ≥ 60 % → cumplido
      { subjectId: 'b', startedAt: at(10, 0), activeSeconds: 10 * 60 } // solo 10 de 50 → atrasado
    ]
    const p = evaluatePlan(blocks, sessions, at(11, 20))
    assert.deepEqual(p.map((x) => x.status), ['done', 'missed', 'current', 'upcoming'])
    assert.equal(p[1]!.debtMinutes, 40)
    assert.deepEqual(debtBySubject(blocks, p), { b: 40 })
  })
  it('estudiar la materia antes no cumple un bloque posterior', () => {
    const p = evaluatePlan([block('a', 15)], [{ subjectId: 'a', startedAt: at(9), activeSeconds: 3000 }], at(16))
    assert.equal(p[0]!.status, 'missed')
  })
})

describe('plan del día y recálculo de pánico', () => {
  let r: Repositories
  let am2: string, fis: string
  beforeEach(() => {
    r = createRepositories(openDatabase(':memory:', MIGRATIONS).db)
    am2 = r.subjects.create({ name: 'AM2', difficulty: 5 }).id
    fis = r.subjects.create({ name: 'Física', difficulty: 4 }).id
    r.events.create({ subjectId: am2, kind: 'exam', title: 'P1', startsAt: new Date(2026, 10, 9, 9), weight: 5 })
    r.events.create({ subjectId: fis, kind: 'exam', title: 'P2', startsAt: new Date(2026, 10, 20, 9), weight: 4 })
    r.checkIns.create({ energy: 'high', urgentSubjectId: null }, at(8, 55))
  })

  it('el plan guardado es estable: no se corre con el reloj', () => {
    const p1 = todayPlan(r, at(9))
    assert.equal(p1.snapshot?.reason, 'checkin')
    const p2 = todayPlan(r, at(9, 40))
    assert.deepEqual(p2.blocks.map((b) => b.start.getTime()), p1.blocks.map((b) => b.start.getTime()))
  })

  it('detecta el atraso y "me atrasé" rearma desde ahora recuperando lo perdido', () => {
    const p = todayPlan(r, at(9))
    const first = p.blocks[0]!
    // No se estudió nada: a las 12 los bloques de la mañana quedaron atrás
    const late = todayPlan(r, at(12))
    assert.ok(late.behind!.blocks >= 2, JSON.stringify(late.behind))
    assert.ok(late.behind!.minutes >= 90)

    const re = recalculatePlan(r, { recover: true }, at(12))
    assert.equal(re.snapshot?.reason, 'panic')
    assert.ok(re.blocks[0]!.start >= at(12), 'arranca desde ahora')
    assert.equal(re.behind!.blocks, 0, 'el plan nuevo empieza sin atrasos')
    assert.ok(re.blocks[0]!.reasons.some((x) => x.startsWith('Recuperás')), re.blocks[0]!.reasons.join(' | '))
    assert.equal(re.blocks[0]!.subjectId, first.subjectId)
    // Y queda guardado: la próxima consulta devuelve el plan recalculado
    assert.equal(todayPlan(r, at(12, 5)).snapshot?.reason, 'panic')
  })

  it('sin recuperar no arrastra deuda; un cambio de energía se registra como check-in', () => {
    todayPlan(r, at(9))
    const re = recalculatePlan(r, { recover: false, energy: 'low' }, at(12))
    assert.ok(!re.blocks.some((b) => b.reasons.some((x) => x.startsWith('Recuperás'))))
    assert.equal(re.energy, 'low')
    assert.equal(re.blocks[0]!.minutes, 25) // bloques cortos con energía baja
    assert.equal(r.checkIns.latestForDay('2026-11-04')!.energy, 'low')
    assert.equal(todayPlan(r, at(12, 10)).snapshot?.reason, 'panic', 'el check-in del recálculo no invalida su plan')
  })

  it('las sesiones reales marcan los bloques como cumplidos', () => {
    const p = todayPlan(r, at(9))
    const b = p.blocks[0]!
    const s = r.sessions.start({ subjectId: b.subjectId }, new Date(b.start.getTime() + 2 * 60_000))
    r.sessions.finish(s.id, { activeSeconds: b.minutes * 60 })
    const later = todayPlan(r, new Date(b.end.getTime() + 60_000))
    assert.equal(later.progress![0]!.status, 'done')
  })

  it('un plan vacío (de noche) no se guarda: a la mañana se arma el del día', () => {
    r.plans // sin plan previo
    const night = todayPlan(r, at(5, 30))
    assert.equal(night.blocks.length, 0)
    assert.equal(r.plans.latestForDay('2026-11-04'), undefined)
  })
})
