import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { brownNoise, makeLoopable, mulberry32, pinkNoise, rms, whiteNoise } from '../src/shared/noise'

const N = 48_000 * 4

/** Energía relativa en graves: diferencia promedio entre muestras consecutivas (≈ agudos). */
const highFreqRatio = (b: Float32Array) => {
  let d = 0
  for (let i = 1; i < b.length; i++) d += Math.abs(b[i]! - b[i - 1]!)
  return d / b.length / (rms(b) || 1)
}

describe('generadores de ruido', () => {
  it('son deterministas con semilla y quedan en [-1, 1]', () => {
    assert.deepEqual(whiteNoise(10, mulberry32(7)), whiteNoise(10, mulberry32(7)))
    for (const b of [whiteNoise(N), pinkNoise(N), brownNoise(N)]) {
      const max = b.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      assert.ok(max <= 1 && max > 0.05, `pico ${max}`)
      const mean = b.reduce((a, v) => a + v, 0) / b.length
      assert.ok(Math.abs(mean) < 0.05, `sin DC (media ${mean})`)
    }
  })
  it('blanco > rosa > marrón en contenido agudo', () => {
    const w = highFreqRatio(whiteNoise(N)), p = highFreqRatio(pinkNoise(N)), b = highFreqRatio(brownNoise(N))
    assert.ok(w > p && p > b, `${w.toFixed(3)} > ${p.toFixed(3)} > ${b.toFixed(3)}`)
  })
  it('el loop no tiene salto en el empalme', () => {
    const src = brownNoise(N)
    const loop = makeLoopable(src, 2400)
    const seam = Math.abs(loop[0]! - loop[loop.length - 1]!)
    const typical = highFreqRatio(loop) * rms(loop)
    assert.ok(seam < typical * 4, `salto ${seam} vs típico ${typical}`)
    assert.equal(loop.length, N - 2400)
  })
})
