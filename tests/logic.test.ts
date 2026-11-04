import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { addDays, diffDays, weekdayMon0 } from '../src/shared/dates'
import { buildHeatmap, heatLevel } from '../src/shared/heatmap'
import { blockMinutes, planStudy, type PlannerInput } from '../src/shared/planner'
import { computeStreaks } from '../src/shared/streaks'
import { nextSubjectColor, resolveSubjectColor, SUBJECT_COLORS } from '../src/shared/subjectColors'
import {
  activeSeconds,
  pauseTimer,
  phaseRemaining,
  resumeTimer,
  skipPhase,
  adjustPhase,
  startTimer,
  tickTimer,
  type TimerConfig
} from '../src/shared/timer'

const MIN = 60_000

describe('fechas', () => {
  it('aritmética de días cruza meses, años y DST', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-29', 1), '2026-03-30') // DST en Europa
    assert.equal(diffDays('2026-11-03', '2026-10-27'), 7)
    assert.equal(weekdayMon0('2026-11-02'), 0) // lunes
    assert.equal(weekdayMon0('2026-11-08'), 6) // domingo
  })
})

describe('rachas', () => {
  const min = 15 * 60
  it('racha viva aunque hoy todavía no se estudió', () => {
    const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d) => ({ localDate: d, seconds: 1800 }))
    const s = computeStreaks(days, '2026-11-03', min)
    assert.equal(s.current, 4)
    assert.equal(s.studiedToday, false)
    assert.equal(s.minutesLeftToday, 15)
  })
  it('hoy cuenta si supera el mínimo; días cortos no cuentan; mejor racha histórica', () => {
    const days = [
      { localDate: '2026-10-01', seconds: 3600 },
      { localDate: '2026-10-02', seconds: 3600 },
      { localDate: '2026-10-03', seconds: 3600 },
      { localDate: '2026-11-01', seconds: 300 }, // menos del mínimo
      { localDate: '2026-11-02', seconds: 3600 },
      { localDate: '2026-11-03', seconds: 3600 }
    ]
    const s = computeStreaks(days, '2026-11-03', min)
    assert.deepEqual([s.current, s.longest, s.studiedToday], [2, 3, true])
  })
  it('se corta si falta ayer', () => {
    assert.equal(computeStreaks([{ localDate: '2026-11-01', seconds: 3600 }], '2026-11-03', min).current, 0)
  })
})

describe('heatmap', () => {
  it('niveles por umbral fijo', () => {
    assert.deepEqual([0, 59, 60, 29 * 60, 30 * 60, 3599, 3600, 7200].map(heatLevel), [0, 0, 1, 1, 2, 2, 3, 4])
  })
  it('53 semanas lunes→domingo que terminan en la semana actual', () => {
    const g = buildHeatmap([{ localDate: '2026-11-03', seconds: 7200 }], '2026-11-03')
    assert.equal(g.weeks.length, 53)
    const last = g.weeks.at(-1)!
    assert.equal(last[0]!.date, '2026-11-02')
    assert.equal(last[1]!.level, 4)
    assert.equal(last[2]!.inRange, false)
    assert.ok(g.weeks.every((w) => w.length === 7))
    assert.ok(g.months.length >= 12)
  })
})

describe('colores de materia', () => {
  it('asigna en orden fijo y resuelve variante oscura', () => {
    assert.equal(nextSubjectColor([]), SUBJECT_COLORS[0])
    assert.equal(nextSubjectColor([SUBJECT_COLORS[0]!]), SUBJECT_COLORS[1])
    assert.equal(resolveSubjectColor('#6250d6', true), '#9085e9')
    assert.equal(resolveSubjectColor('#123456', true), '#123456')
  })
})

describe('cronómetro', () => {
  const cfg: TimerConfig = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 25, cyclesBeforeLongBreak: 3, plannedMinutes: 80 }
  it('divide el bloque en fases, cuenta solo el foco y respeta pausas', () => {
    let s = startTimer(cfg, 0)
    assert.equal(s.phaseDurationMs, 50 * MIN)
    s = pauseTimer(s, 20 * MIN)
    assert.equal(activeSeconds(s, 999 * MIN), 20 * 60) // en pausa no suma
    s = resumeTimer(s, 30 * MIN)
    let r = tickTimer(s, 61 * MIN) // 50 min de foco cumplidos a los 60'
    assert.equal(r.finished, 'focus')
    assert.equal(r.state.phase, 'break')
    assert.equal(activeSeconds(r.state, 61 * MIN), 50 * 60)
    r = tickTimer(r.state, 71 * MIN)
    assert.equal(r.finished, 'break')
    assert.equal(r.state.phase, 'focus')
    assert.equal(r.state.runningSince, null) // espera al usuario
    assert.equal(r.state.phaseDurationMs, 30 * MIN) // resto del bloque de 80'
    s = resumeTimer(r.state, 75 * MIN)
    r = tickTimer(s, 200 * MIN)
    assert.equal(r.state.phase, 'done')
    assert.equal(activeSeconds(r.state, 300 * MIN), 80 * 60) // nunca más de lo planificado
  })
  it('sesión libre no termina; saltar foco no regala tiempo', () => {
    let s = startTimer({ ...cfg, plannedMinutes: null }, 0)
    s = skipPhase(s, 5 * MIN)
    assert.equal(s.phase, 'break')
    assert.equal(activeSeconds(s, 6 * MIN), 5 * 60)
    assert.equal(phaseRemaining(s, 5 * MIN), 10 * MIN)
  })
  it('±5 min: alarga el foco (y el bloque) y nunca deja menos de 1 minuto', () => {
    let s = startTimer({ ...cfg, plannedMinutes: 30 }, 0)
    const base = s.phaseDurationMs
    s = adjustPhase(s, 5 * MIN, 0)
    assert.equal(s.phaseDurationMs, base + 5 * MIN)
    assert.equal(s.config.plannedMinutes, 35)
    s = adjustPhase(s, -500 * MIN, 10 * MIN)
    assert.equal(phaseRemaining(s, 10 * MIN), MIN)
  })
})

describe('planificador', () => {
  const now = new Date('2026-11-03T09:00:00')
  const day = (n: number, h = 9) => new Date(now.getTime() + n * 86_400_000 + (h - 9) * 3_600_000)
  const base: PlannerInput = {
    now,
    energy: 'high',
    urgentSubjectId: null,
    subjects: [
      { id: 'am2', name: 'Análisis II', difficulty: 5 },
      { id: 'sis', name: 'Sistemas', difficulty: 2 },
      { id: 'fis', name: 'Física', difficulty: 4 }
    ],
    milestones: [
      { id: 'e1', subjectId: 'am2', kind: 'exam', title: 'Parcial AM2', startsAt: day(5), weight: 5 },
      { id: 'e2', subjectId: 'sis', kind: 'assignment', title: 'TP Sistemas', startsAt: day(6), weight: 3 },
      { id: 'e3', subjectId: 'fis', kind: 'exam', title: 'Parcial Física', startsAt: day(20), weight: 4 }
    ],
    documents: [
      { id: 'd1', subjectId: 'am2', title: 'Apunte AM2', pageCount: 120, maxPageRead: 20, lastOpenedAt: null }
    ],
    busy: [],
    studiedTodaySeconds: {},
    focusMinutes: 50,
    breakMinutes: 10
  }

  it('energía alta: primero la materia exigente y urgente, en modo profundo', () => {
    const { blocks } = planStudy(base)
    assert.equal(blocks[0]!.subjectId, 'am2')
    assert.equal(blocks[0]!.mode, 'profundo')
    assert.equal(blocks[0]!.minutes, 50)
    assert.ok(blocks[0]!.reasons.some((r) => r.includes('Parcial en 5 días')))
  })

  it('distribuye páginas: 100 restantes en 5 días → 20 por sesión', () => {
    const b = planStudy(base).blocks[0]!
    assert.deepEqual(b.document, { id: 'd1', title: 'Apunte AM2', pageFrom: 21, pageTo: 40 })
  })

  it('energía baja: bloques cortos y tareas livianas primero', () => {
    const { blocks } = planStudy({ ...base, energy: 'low' })
    assert.equal(blocks[0]!.minutes, blockMinutes('low', 50))
    assert.ok(blocks[0]!.load <= 3, `carga ${blocks[0]!.load}`)
  })

  it('la materia urgente del check-in sube de prioridad', () => {
    const { blocks } = planStudy({ ...base, urgentSubjectId: 'fis' })
    assert.equal(blocks[0]!.subjectId, 'fis')
    assert.equal(blocks[0]!.reasons[0], 'La marcaste como urgente')
  })

  it('intercala materias y no se pisa con las clases', () => {
    const busy = [{ startsAt: new Date('2026-11-03T10:30:00'), endsAt: new Date('2026-11-03T12:30:00'), title: 'Clase' }]
    const { blocks, nextBusy } = planStudy({ ...base, busy })
    assert.equal(nextBusy?.title, 'Clase')
    for (const b of blocks) {
      const overlaps = b.start < busy[0]!.endsAt && b.end > busy[0]!.startsAt
      assert.equal(overlaps, false, `${b.start.toISOString()} se pisa con la clase`)
    }
    // Alterna materias: con 4 bloques aparecen las 3 y ninguna acapara más de 2.
    const counts = new Map<string, number>()
    for (const b of blocks) counts.set(b.subjectId, (counts.get(b.subjectId) ?? 0) + 1)
    assert.equal(counts.size, 3)
    assert.ok(Math.max(...counts.values()) <= 2)
  })

  it('la deuda se descuenta bloque a bloque', () => {
    const { blocks } = planStudy({ ...base, debtMinutes: { sis: 70 } })
    const sis = blocks.filter((b) => b.subjectId === 'sis')
    assert.equal(sis[0]!.reasons[0], 'Recuperás 50 de 70 min atrasados')
    if (sis[1]) assert.equal(sis[1].reasons[0], 'Recuperás 20 min atrasados')
    assert.ok(blocks.findIndex((b) => b.subjectId === 'sis') <= 1, 'la materia con deuda sube')
  })

  it('no sugiere nada pasada la hora de corte ni de madrugada', () => {
    assert.equal(planStudy({ ...base, now: new Date('2026-11-03T23:30:00') }).blocks.length, 0)
    assert.equal(planStudy({ ...base, now: new Date('2026-11-04T00:10:00') }).blocks.length, 0)
    assert.equal(planStudy({ ...base, now: new Date('2026-11-04T05:59:00') }).blocks.length, 0)
    assert.ok(planStudy({ ...base, now: new Date('2026-11-04T06:00:00') }).blocks.length > 0)
  })
})
