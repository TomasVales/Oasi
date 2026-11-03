import { brownNoise, makeLoopable, mulberry32, pinkNoise, whiteNoise } from '@shared/noise'
import type { SoundscapeId } from '@shared/settings'

/**
 * Motor de soundscapes con Web Audio: todo se sintetiza en tiempo real (sin archivos,
 * funciona offline y nunca se repite igual). Cada paisaje es un grafo de nodos que
 * termina en un gain maestro (volumen + fundidos) y un analizador (nivel real de la señal).
 */
const SECONDS = 8

type Stopper = () => void

export class SoundscapeEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private current: { id: SoundscapeId; stop: Stopper } | null = null
  private volume = 0.5
  private levelData: Float32Array<ArrayBuffer> | null = null

  get playing(): SoundscapeId | null {
    return this.current?.id ?? null
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' })
      this.master = this.ctx.createGain()
      this.master.gain.value = 0
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.master.connect(this.analyser).connect(this.ctx.destination)
    }
    return this.ctx
  }

  /** Buffers de ruido generados una vez y reutilizados (loopables, sin "click"). */
  private noise(kind: 'white' | 'pink' | 'brown', seed = 1): AudioBuffer {
    const key = `${kind}:${seed}`
    const cached = this.buffers.get(key)
    if (cached) return cached
    const ctx = this.ensure()
    const fade = Math.round(ctx.sampleRate * 0.05)
    const n = ctx.sampleRate * SECONDS + fade
    const buf = ctx.createBuffer(2, n - fade, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const rand = mulberry32(seed * 101 + ch * 7 + kind.length)
      const raw = kind === 'white' ? whiteNoise(n, rand) : kind === 'pink' ? pinkNoise(n, rand) : brownNoise(n, rand)
      buf.copyToChannel(makeLoopable(raw, fade) as Float32Array<ArrayBuffer>, ch)
    }
    this.buffers.set(key, buf)
    return buf
  }

  private loop(buffer: AudioBuffer, dest: AudioNode, offset = 0): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.connect(dest)
    src.start(0, offset % buffer.duration)
    return src
  }

  /** Conecta nodos en serie (a → b → c …) y devuelve el primero: la entrada de la cadena. */
  private chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!)
    return nodes[0]!
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  private gain(v: number): GainNode {
    const g = this.ctx!.createGain()
    g.gain.value = v
    return g
  }

  /** Modula un parámetro con un LFO senoidal (respiración, fluctuaciones). */
  private lfo(param: AudioParam, freq: number, depth: number): OscillatorNode {
    const osc = this.ctx!.createOscillator()
    osc.frequency.value = freq
    const amt = this.gain(depth)
    osc.connect(amt).connect(param)
    osc.start()
    return osc
  }

  /**
   * Programa eventos al azar (gotas, tintineos) con anticipación sobre el reloj de audio:
   * precisión de muestra aunque el hilo de JS se demore.
   */
  private scheduler(every: () => number, fire: (when: number) => void): Stopper {
    const ctx = this.ctx!
    let next = ctx.currentTime + every()
    const id = window.setInterval(() => {
      while (next < ctx.currentTime + 0.25) {
        fire(next)
        next += every()
      }
    }, 80)
    return () => window.clearInterval(id)
  }

  // ─── Paisajes ──────────────────────────────────────────────────────────────
  private buildNoise(kind: 'white' | 'pink' | 'brown'): Stopper {
    const level = { white: 0.22, pink: 0.55, brown: 0.75 }[kind]
    // El blanco puro cansa: se suaviza apenas arriba de 9 kHz.
    const src = this.loop(this.noise(kind), this.chain(this.gain(level), this.filter('lowpass', kind === 'white' ? 9000 : 12000), this.master!))
    return () => src.stop()
  }

  private buildRain(): Stopper {
    const ctx = this.ctx!
    const stops: Stopper[] = []
    const m = this.master!
    // Cama: ruido rosa entre 400 Hz y 7 kHz, que "respira" lentamente.
    const bed = this.gain(0.42)
    const bedSrc = this.loop(this.noise('pink', 4), this.chain(this.filter('highpass', 400), this.filter('lowpass', 7000), bed, m))
    const breath = this.lfo(bed.gain, 0.07, 0.08)
    // Repiqueteo agudo
    const patterSrc = this.loop(this.noise('white', 5), this.chain(this.filter('bandpass', 3200, 0.6), this.gain(0.06), m))
    // Rumor grave (lluvia lejana)
    const rumbleSrc = this.loop(this.noise('brown', 6), this.chain(this.filter('lowpass', 180), this.gain(0.28), m))
    // Gotas individuales: ráfagas cortas filtradas, repartidas en estéreo.
    const rand = mulberry32(42)
    const drop = this.noise('white', 7)
    stops.push(
      this.scheduler(
        () => 0.02 + rand() * 0.11,
        (when) => {
          const src = ctx.createBufferSource()
          src.buffer = drop
          const env = ctx.createGain()
          const peak = 0.04 + rand() * 0.12
          env.gain.setValueAtTime(0, when)
          env.gain.linearRampToValueAtTime(peak, when + 0.002)
          env.gain.exponentialRampToValueAtTime(0.0001, when + 0.03 + rand() * 0.05)
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand() * 1.6 - 0.8
          src.connect(this.chain(this.filter('bandpass', 1800 + rand() * 5200, 2 + rand() * 4), env, pan, m))
          src.start(when, rand() * 6, 0.12)
        }
      )
    )
    return () => {
      stops.forEach((s) => s())
      breath.stop()
      ;[bedSrc, patterSrc, rumbleSrc].forEach((s) => s.stop())
    }
  }

  private buildCafe(): Stopper {
    const ctx = this.ctx!
    const m = this.master!
    const stops: Stopper[] = []
    const oscs: OscillatorNode[] = []
    // Ambiente de sala
    const srcs: AudioBufferSourceNode[] = [this.loop(this.noise('brown', 8), this.chain(this.filter('lowpass', 450), this.gain(0.35), m))]
    // Murmullo: bandas de voz cuya amplitud fluctúa como sílabas (3–6 Hz) y frases (~0,1 Hz).
    const voices = [
      { f: 320, q: 3, g: 0.22, syl: 3.7, phrase: 0.11, pan: -0.4 },
      { f: 650, q: 3.5, g: 0.18, syl: 4.9, phrase: 0.17, pan: 0.3 },
      { f: 1250, q: 4, g: 0.1, syl: 5.6, phrase: 0.09, pan: 0.05 },
      { f: 900, q: 3, g: 0.12, syl: 4.2, phrase: 0.13, pan: 0.55 }
    ]
    voices.forEach((v, i) => {
      const g = this.gain(v.g)
      const pan = ctx.createStereoPanner()
      pan.pan.value = v.pan
      srcs.push(this.loop(this.noise('pink', 10 + i), this.chain(this.filter('bandpass', v.f, v.q), g, pan, m), i * 1.3))
      oscs.push(this.lfo(g.gain, v.syl, v.g * 0.55), this.lfo(g.gain, v.phrase, v.g * 0.45))
    })
    // Tintineos de tazas y cucharas: parciales inarmónicos con caída rápida.
    const rand = mulberry32(99)
    stops.push(
      this.scheduler(
        () => 1.8 + rand() * 6,
        (when) => {
          const base = 1900 + rand() * 1400
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand() * 1.4 - 0.7
          pan.connect(m)
          const hits = rand() < 0.35 ? 2 : 1
          for (let h = 0; h < hits; h++) {
            const t = when + h * (0.09 + rand() * 0.08)
            for (const ratio of [1, 1.52, 2.74]) {
              const o = ctx.createOscillator()
              o.frequency.value = base * ratio
              const env = ctx.createGain()
              const peak = (0.035 / ratio) * (0.6 + rand() * 0.6)
              env.gain.setValueAtTime(0, t)
              env.gain.linearRampToValueAtTime(peak, t + 0.003)
              env.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + rand() * 0.2)
              o.connect(env).connect(pan)
              o.start(t)
              o.stop(t + 0.6)
            }
          }
        }
      )
    )
    return () => {
      stops.forEach((s) => s())
      oscs.forEach((o) => o.stop())
      srcs.forEach((s) => s.stop())
    }
  }

  // ─── API pública ───────────────────────────────────────────────────────────
  async play(id: SoundscapeId): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.current?.id === id) return
    if (this.current) this.stopNow()
    const stop =
      id === 'rain' ? this.buildRain() : id === 'cafe' ? this.buildCafe() : this.buildNoise(id === 'white' ? 'white' : id === 'pink' ? 'pink' : 'brown')
    this.current = { id, stop }
    // Fundido de entrada suave (constante de tiempo ≈ 0,4 s).
    const g = this.master!.gain
    g.cancelScheduledValues(ctx.currentTime)
    g.setValueAtTime(g.value, ctx.currentTime)
    g.setTargetAtTime(this.volume, ctx.currentTime, 0.4)
  }

  private stopNow() {
    this.current?.stop()
    this.current = null
  }

  /** Fundido de salida y corte. */
  stop(fadeMs = 700): Promise<void> {
    const ctx = this.ctx
    const cur = this.current
    if (!ctx || !cur) return Promise.resolve()
    const g = this.master!.gain
    g.cancelScheduledValues(ctx.currentTime)
    g.setValueAtTime(g.value, ctx.currentTime)
    g.setTargetAtTime(0, ctx.currentTime, fadeMs / 4000)
    this.current = null
    return new Promise((r) =>
      window.setTimeout(() => {
        cur.stop()
        r()
      }, fadeMs)
    )
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v))
    if (!this.ctx || !this.current) return
    this.master!.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08)
  }

  /** Nivel RMS actual de la salida (0–1): alimenta el medidor visual. */
  level(): number {
    if (!this.analyser) return 0
    this.levelData ??= new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(this.levelData)
    let s = 0
    for (const v of this.levelData) s += v * v
    return Math.sqrt(s / this.levelData.length)
  }

  dispose() {
    this.stopNow()
    void this.ctx?.close()
    this.ctx = null
  }
}
