/**
 * Cronómetro de estudio como máquina de estados pura. Todo se deriva de timestamps
 * (no de contar ticks), así que no se desfasa si la ventana queda en segundo plano.
 *
 * Fases: focus → break → focus … hasta cubrir el tiempo planificado del bloque.
 * Al terminar un descanso queda en pausa esperando al usuario (no suma tiempo si se fue).
 */
export type TimerPhase = 'focus' | 'break' | 'done'

export interface TimerConfig {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
  /** Minutos de foco del bloque sugerido; null = sesión libre (sin fin). */
  plannedMinutes: number | null
}

export interface TimerState {
  phase: TimerPhase
  phaseDurationMs: number
  /** Tiempo acumulado de la fase antes de la última reanudación. */
  phaseElapsedMs: number
  /** Epoch ms de la última reanudación; null = en pausa. */
  runningSince: number | null
  /** Foco ya completado en fases anteriores. */
  focusDoneMs: number
  cycle: number
  config: TimerConfig
}

const MIN = 60_000

function nextFocusMs(config: TimerConfig, focusDoneMs: number): number {
  const chunk = config.focusMinutes * MIN
  if (config.plannedMinutes === null) return chunk
  return Math.max(0, Math.min(chunk, config.plannedMinutes * MIN - focusDoneMs))
}

export function startTimer(config: TimerConfig, now: number): TimerState {
  return {
    phase: 'focus',
    phaseDurationMs: nextFocusMs(config, 0),
    phaseElapsedMs: 0,
    runningSince: now,
    focusDoneMs: 0,
    cycle: 1,
    config
  }
}

export const phaseElapsed = (s: TimerState, now: number) =>
  s.phaseElapsedMs + (s.runningSince === null ? 0 : Math.max(0, now - s.runningSince))

export const phaseRemaining = (s: TimerState, now: number) => Math.max(0, s.phaseDurationMs - phaseElapsed(s, now))

/** Segundos de foco efectivo (lo que suma al heatmap). */
export function activeSeconds(s: TimerState, now: number): number {
  const current = s.phase === 'focus' ? Math.min(phaseElapsed(s, now), s.phaseDurationMs) : 0
  return Math.floor((s.focusDoneMs + current) / 1000)
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  if (s.runningSince === null) return s
  return { ...s, phaseElapsedMs: phaseElapsed(s, now), runningSince: null }
}

export function resumeTimer(s: TimerState, now: number): TimerState {
  if (s.runningSince !== null || s.phase === 'done') return s
  return { ...s, runningSince: now }
}

export interface TickResult {
  state: TimerState
  /** Fase que terminó en este tick (para notificar), si alguna. */
  finished: TimerPhase | null
}

export function tickTimer(s: TimerState, now: number): TickResult {
  if (s.runningSince === null || s.phase === 'done') return { state: s, finished: null }
  if (phaseElapsed(s, now) < s.phaseDurationMs) return { state: s, finished: null }

  // La fase terminó exactamente en endAt; el sobrante se descarta (no se cuenta foco de más).
  const endAt = s.runningSince + (s.phaseDurationMs - s.phaseElapsedMs)
  if (s.phase === 'focus') {
    const focusDoneMs = s.focusDoneMs + s.phaseDurationMs
    const plannedDone = s.config.plannedMinutes !== null && focusDoneMs >= s.config.plannedMinutes * MIN
    if (plannedDone) {
      return {
        state: { ...s, phase: 'done', focusDoneMs, phaseElapsedMs: s.phaseDurationMs, runningSince: null },
        finished: 'focus'
      }
    }
    const long = s.cycle % s.config.cyclesBeforeLongBreak === 0
    return {
      state: {
        ...s,
        phase: 'break',
        focusDoneMs,
        phaseDurationMs: (long ? s.config.longBreakMinutes : s.config.shortBreakMinutes) * MIN,
        phaseElapsedMs: Math.max(0, now - endAt),
        runningSince: now
      },
      finished: 'focus'
    }
  }
  // Fin del descanso: siguiente foco preparado, en pausa.
  return {
    state: {
      ...s,
      phase: 'focus',
      cycle: s.cycle + 1,
      phaseDurationMs: nextFocusMs(s.config, s.focusDoneMs),
      phaseElapsedMs: 0,
      runningSince: null
    },
    finished: 'break'
  }
}

/** Saltar el descanso (o la fase actual) y pasar a la siguiente. */
export function skipPhase(s: TimerState, now: number): TimerState {
  if (s.phase === 'done') return s
  const forced = { ...s, phaseElapsedMs: s.phaseDurationMs, runningSince: now }
  const { state } = tickTimer(forced, now)
  if (s.phase === 'focus') {
    // Saltar foco no regala tiempo: se cuenta solo lo realmente transcurrido.
    return { ...state, focusDoneMs: s.focusDoneMs + Math.min(phaseElapsed(s, now), s.phaseDurationMs) }
  }
  return state
}
