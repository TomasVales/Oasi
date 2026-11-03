import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { IdleMonitor, type AwayEvent } from '../src/main/idle'
import { moveWidget, normalizeDashboard } from '../src/shared/dashboard'
import { pauseTimer, activeSeconds, startTimer } from '../src/shared/timer'

function fakeSource() {
  const s = { idle: 0, lock: () => {} }
  return {
    s,
    source: { getSystemIdleTime: () => s.idle, on: (_e: 'lock-screen', cb: () => void) => (s.lock = cb) }
  }
}

describe('modo ausente', () => {
  it('avisa una sola vez por ausencia y se rearma al volver', () => {
    const { s, source } = fakeSource()
    const events: AwayEvent[] = []
    const m = new IdleMonitor(source, () => ({ enabled: true, minutes: 10 }), (e) => events.push(e))
    s.idle = 599
    m.check()
    assert.equal(events.length, 0)
    s.idle = 600
    m.check()
    s.idle = 900
    m.check()
    assert.deepEqual(events, [{ idleSeconds: 600, reason: 'idle' }])
    s.idle = 1 // el usuario volvió
    m.check()
    s.idle = 650
    m.check()
    assert.equal(events.length, 2)
  })
  it('bloquear la pantalla activa el modo ausente; desactivado no hace nada', () => {
    const { s, source } = fakeSource()
    const events: AwayEvent[] = []
    let enabled = false
    new IdleMonitor(source, () => ({ enabled, minutes: 10 }), (e) => events.push(e))
    s.lock()
    assert.equal(events.length, 0)
    enabled = true
    s.lock()
    assert.deepEqual(events, [{ idleSeconds: 0, reason: 'lock' }])
  })
  it('pausar en el momento en que empezó la inactividad no cuenta los minutos ausentes', () => {
    const MIN = 60_000
    const cfg = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 25, cyclesBeforeLongBreak: 3, plannedMinutes: null }
    const t = startTimer(cfg, 0)
    // Detectado a los 30', pero el usuario se fue a los 20' (10' de inactividad)
    const paused = pauseTimer(t, 30 * MIN - 10 * MIN)
    assert.equal(activeSeconds(paused, 30 * MIN), 20 * 60)
  })
})

describe('dashboard modular', () => {
  it('normaliza layouts guardados y agrega widgets nuevos al final', () => {
    const d = normalizeDashboard({ order: ['heatmap', 'plan', 'plan', 'inexistente' as never], hidden: ['streak', 'x' as never] })
    assert.deepEqual(d.order.slice(0, 2), ['heatmap', 'plan'])
    assert.equal(d.order.length, 6)
    assert.deepEqual(d.hidden, ['streak'])
  })
  it('mueve un widget a la posición de otro', () => {
    assert.deepEqual(moveWidget(['plan', 'countdown', 'streak'], 'streak', 'plan'), ['streak', 'plan', 'countdown'])
    assert.deepEqual(moveWidget(['plan', 'countdown', 'streak'], 'plan', 'streak'), ['countdown', 'streak', 'plan'])
  })
})
