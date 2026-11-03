/**
 * Generadores de ruido para los soundscapes (puros: sin Web Audio, testeables con Node).
 * Blanco: espectro plano. Rosa: −3 dB/octava (suave, natural). Marrón: −6 dB/octava (grave, envolvente).
 */

/** PRNG con semilla (mulberry32): mismo sonido en cada sesión, sin depender de Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function whiteNoise(n: number, rand = mulberry32(1)): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1
  return out
}

/** Ruido rosa con el filtro de Paul Kellet (aprox. −3 dB/octava en el rango audible). */
export function pinkNoise(n: number, rand = mulberry32(2)): Float32Array {
  const out = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return out
}

/** Ruido marrón: integrador con fuga (no deriva hacia un DC), normalizado. */
export function brownNoise(n: number, rand = mulberry32(3)): Float32Array {
  const out = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02
    out[i] = last * 3.5
  }
  return out
}

/**
 * Hace el buffer reproducible en loop sin "click": funde el final sobre el principio
 * (equal-power) y recorta ese tramo. Devuelve un buffer `fade` muestras más corto.
 */
export function makeLoopable(src: Float32Array, fade: number): Float32Array {
  const n = src.length - fade
  const out = src.slice(0, n)
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    const a = Math.cos((t * Math.PI) / 2) // sale el final
    const b = Math.sin((t * Math.PI) / 2) // entra el principio
    out[i] = src[n + i]! * a + src[i]! * b
  }
  return out
}

export function rms(buf: Float32Array): number {
  let s = 0
  for (const v of buf) s += v * v
  return Math.sqrt(s / buf.length)
}
