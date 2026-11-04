import type { ChimeSound } from '@shared/settings'

/**
 * Aviso sonoro de fin de fase, sintetizado (sin archivos). Corre en su propio AudioContext,
 * independiente de los sonidos ambiente: suena aunque no haya ninguno activo.
 *  - Fin del foco: dos notas descendentes (relajá).
 *  - Fin del descanso: dos notas ascendentes (volvamos).
 */
let ctx: AudioContext | null = null

const NOTES = { up: [523.25, 783.99], down: [783.99, 523.25] } // Do5 / Sol5

interface Voice {
  type: OscillatorType
  /** Armónicos extra (múltiplo de la frecuencia, ganancia relativa). */
  partials: [number, number][]
  decay: number
  gap: number
}

const VOICES: Record<ChimeSound, Voice> = {
  bell: { type: 'sine', partials: [[2.76, 0.35], [5.4, 0.12]], decay: 2.2, gap: 0.32 },
  soft: { type: 'sine', partials: [[2, 0.08]], decay: 1.2, gap: 0.42 },
  digital: { type: 'square', partials: [], decay: 0.18, gap: 0.16 }
}

function note(c: AudioContext, out: AudioNode, freq: number, at: number, v: Voice, volume: number) {
  const parts: [number, number][] = [[1, 1], ...v.partials]
  for (const [mult, g] of parts) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = v.type
    osc.frequency.value = freq * mult
    const peak = volume * g * (v.type === 'square' ? 0.12 : 0.35)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + v.decay)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + v.decay + 0.05)
  }
}

export function playChime(sound: ChimeSound, volume: number, direction: 'up' | 'down') {
  if (volume <= 0) return
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    const v = VOICES[sound]
    const t0 = ctx.currentTime + 0.02
    NOTES[direction].forEach((f, i) => note(ctx!, ctx!.destination, f, t0 + i * v.gap, v, volume))
  } catch {
    /* audio no disponible */
  }
}
