/**
 * Genera los íconos PNG de la app a partir del pixel art de src/shared/pixelIcon.ts.
 *   npm run icons
 * Sale: resources/icon.png (1024, lo usa electron-builder para .icns/.ico) y
 *       resources/icons/<variante>.png (para cambiar el ícono del dock en Ajustes).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { ICON_PALETTES, ICON_SIZE, ICON_VARIANTS, iconPixels, type IconVariant } from '../src/shared/pixelIcon'

const OUT = join(import.meta.dirname, '..', 'resources')

// ── Codificador PNG mínimo (RGBA 8 bits) ─────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filtro "None"
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/**
 * Plantilla de íconos de macOS: placa de 824 px centrada en 1024 con esquinas redondeadas.
 * Usamos 832 (= 32 × 26) para que cada pixel del dibujo mida exactamente 26 px (nítido).
 * El borde de la placa se suaviza con 4×4 de sobremuestreo; el dibujo, no (es pixel art).
 */
function renderIcon(variant: IconVariant, size = 1024): Buffer {
  const pal = ICON_PALETTES[variant]
  const px = iconPixels()
  const plate = 832
  const inset = (1024 - plate) / 2
  const radius = 186
  const scale = size / 1024
  const out = new Uint8Array(size * size * 4)
  const cell = plate / ICON_SIZE

  const insidePlate = (x: number, y: number) => {
    const lx = x - inset, ly = y - inset
    if (lx < 0 || ly < 0 || lx > plate || ly > plate) return false
    const cx = Math.min(Math.max(lx, radius), plate - radius)
    const cy = Math.min(Math.max(ly, radius), plate - radius)
    return (lx - cx) ** 2 + (ly - cy) ** 2 <= radius ** 2
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Cobertura de la placa (antialias)
      let cover = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (insidePlate((x + (sx + 0.5) / 4) / scale, (y + (sy + 0.5) / 4) / scale)) cover++
      if (!cover) continue
      const gx = Math.min(ICON_SIZE - 1, Math.max(0, Math.floor(((x + 0.5) / scale - inset) / cell)))
      const gy = Math.min(ICON_SIZE - 1, Math.max(0, Math.floor(((y + 0.5) / scale - inset) / cell)))
      const idx = px[gy]![gx]!
      const [r, g, b] = hex(pal[idx as keyof typeof pal] ?? pal[1 as keyof typeof pal])
      const o = (y * size + x) * 4
      out[o] = r!
      out[o + 1] = g!
      out[o + 2] = b!
      out[o + 3] = Math.round((cover / 16) * 255)
    }
  }
  return encodePng(size, size, out)
}

mkdirSync(join(OUT, 'icons'), { recursive: true })
for (const v of ICON_VARIANTS) {
  writeFileSync(join(OUT, 'icons', `${v}.png`), renderIcon(v, 512))
  console.log(`✓ resources/icons/${v}.png`)
}
writeFileSync(join(OUT, 'icon.png'), renderIcon('clasico', 1024))
console.log('✓ resources/icon.png (1024)')
