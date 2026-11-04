import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { addDays, diffDays, weekdayMon0 } from '../src/shared/dates'
import { cardId, NEW_CARD, parseFlashcards, scheduleReview } from '../src/shared/flashcards'
import { summarizeWeek, weekToSummarize } from '../src/shared/weeklySummary'
import { buildPresence, DEFAULT_DISCORD } from '../src/shared/discord'
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

describe('tarjetas de repaso', () => {

  it('lee "pregunta :: respuesta" de los apuntes, ignorando código y duplicados', () => {
    const md = [
      '# Tema 1',
      '- ¿Qué es un límite? :: El valor al que se acerca f(x)',
      '> **Bolzano** :: raíz si cambia de signo',
      'texto normal con a::b pegado',
      '```',
      'x :: y',
      '```',
      '¿Qué es un límite? :: duplicada',
      '1. Derivada :: pendiente de la tangente'
    ].join('\n')
    assert.deepEqual(parseFlashcards(md), [
      { front: '¿Qué es un límite?', back: 'El valor al que se acerca f(x)' },
      { front: '**Bolzano**', back: 'raíz si cambia de signo' },
      { front: 'Derivada', back: 'pendiente de la tangente' }
    ])
  })

  it('el id depende de la pregunta (no de mayúsculas ni espacios)', () => {
    assert.equal(cardId('n1', 'Hola  Mundo'), cardId('n1', 'hola mundo'))
    assert.notEqual(cardId('n1', 'a'), cardId('n2', 'a'))
  })

  it('intervalos crecientes; "otra vez" vuelve en 10 min; un parcial cerca los acorta', () => {
    const DAY = 86_400_000
    let s = scheduleReview(NEW_CARD, 'good', 0)
    assert.equal(s.intervalDays, 1)
    s = scheduleReview(s, 'good', 0)
    assert.equal(s.intervalDays, 3)
    s = scheduleReview(s, 'good', 0)
    assert.equal(s.intervalDays, 7.5)
    const again = scheduleReview(s, 'again', 0)
    assert.equal(again.dueAt, 10 * 60_000)
    assert.equal(again.lapses, 1)
    const nearExam = scheduleReview(s, 'easy', 0, 4)
    assert.equal(nearExam.intervalDays, 3) // el día antes del parcial como tarde
    assert.equal(nearExam.dueAt, 3 * DAY)
  })
})

describe('resumen semanal', () => {
  it('elige la semana: el domingo a la noche la actual, si no la pasada', () => {
    assert.equal(weekToSummarize(new Date('2026-11-08T19:00:00')), '2026-11-02') // domingo 19 h
    assert.equal(weekToSummarize(new Date('2026-11-08T10:00:00')), '2026-10-26') // domingo a la mañana
    assert.equal(weekToSummarize(new Date('2026-11-09T09:00:00')), '2026-11-02') // lunes
  })

  it('totales, mejor día, foco ponderado, metas y comparación con la semana anterior', () => {
    const s = summarizeWeek({
      weekStart: '2026-11-02',
      prevTotalSeconds: 4 * 3600,
      subjects: [
        { id: 'am', name: 'AM2', color: '#f00', weeklyGoalMinutes: 120 },
        { id: 'fis', name: 'Física', color: '#00f', weeklyGoalMinutes: 180 },
        { id: 'qui', name: 'Química', color: '#0f0', weeklyGoalMinutes: null }
      ],
      sessions: [
        { subjectId: 'am', localDate: '2026-11-02', activeSeconds: 3600, focusScore: 1 },
        { subjectId: 'am', localDate: '2026-11-04', activeSeconds: 5400, focusScore: 0.5 },
        { subjectId: null, localDate: '2026-11-04', activeSeconds: 1800, focusScore: null },
        { subjectId: 'fis', localDate: '2026-11-09', activeSeconds: 9999, focusScore: null } // otra semana
      ]
    })
    assert.equal(s.totalSeconds, 3 * 3600)
    assert.equal(s.delta, -0.25)
    assert.equal(s.daysStudied, 2)
    assert.deepEqual(s.bestDay, { date: '2026-11-04', seconds: 7200 })
    assert.equal(s.avgFocus, 0.7) // (1·60 + 0.5·90) / 150
    assert.deepEqual(s.subjects.map((r) => [r.name, r.seconds]), [['AM2', 9000], ['Sin materia', 1800], ['Física', 0]])
    assert.equal(s.goalsMet, 1)
    assert.equal(s.goalsTotal, 2)
  })
})

describe('presencia en Discord', () => {
  const base = {
    settings: DEFAULT_DISCORD,
    view: { section: 'home' as const, subjectName: null, docTitle: null, noteTitle: null },
    streak: 5,
    todaySeconds: 4500,
    dueCards: 0,
    appStartedAt: 1000
  }
  const session = {
    subjectName: 'Análisis II',
    modeLabel: null,
    phase: 'focus' as const,
    running: true,
    phaseEndsAt: 99_000,
    focusedSeconds: 1500,
    cycle: 2,
    focusMinutes: 50,
    plannedMinutes: 150
  }

  it('en foco: materia, pomodoro, cuenta regresiva y racha en el tooltip', () => {
    const p = buildPresence({ ...base, session })
    assert.equal(p.details, '🍅 Estudiando Análisis II')
    assert.equal(p.state, 'Pomodoro 2 de 3 · 25 min de foco')
    assert.equal(p.endTimestamp, 99_000)
    assert.equal(p.largeImageText, 'Oasi · 🔥 5 días de racha · 1 h 15 min hoy')
  })

  it('respeta la privacidad: sin materia, sin títulos, sin stats', () => {
    const settings = { enabled: true, showSubject: false, showTitles: false, showStats: false }
    const p = buildPresence({ ...base, settings, session, view: { section: 'study', subjectName: 'X', docTitle: 'Secreto.pdf', noteTitle: null } })
    assert.equal(p.details, '🍅 Estudiando')
    assert.ok(!p.state.includes('Secreto'))
    assert.equal(p.largeImageText, 'Oasi')
  })

  it('pausa sin contador; descanso con contador; fuera de sesión según la sección', () => {
    const paused = buildPresence({ ...base, session: { ...session, running: false } })
    assert.equal(paused.details, '⏸ En pausa · Análisis II')
    assert.equal(paused.endTimestamp, undefined)
    assert.equal(buildPresence({ ...base, session: { ...session, phase: 'break' } }).details, '☕ Descansando · Análisis II')
    const reading = buildPresence({
      ...base,
      settings: { ...DEFAULT_DISCORD, showTitles: true },
      session: null,
      view: { section: 'study', subjectName: 'Física', docTitle: 'Cinemática', noteTitle: null }
    })
    assert.equal(reading.details, '📚 En Física')
    assert.equal(reading.state, '📖 Leyendo «Cinemática»')
    assert.equal(reading.startTimestamp, 1000)
  })
})
