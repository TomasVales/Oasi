/**
 * Ícono de la app en pixel art (32×32): un par de auriculares inalámbricos sobre un
 * fondo liso, con una nota musical. Se dibuja por código: el mismo mapa genera
 * el PNG de la app (scripts/generate-icons.ts) y el logo SVG de la interfaz.
 */
export const ICON_VARIANTS = ['clasico', 'noche', 'neon'] as const
export type IconVariant = (typeof ICON_VARIANTS)[number]

export const isIconVariant = (v: unknown): v is IconVariant => typeof v === 'string' && (ICON_VARIANTS as readonly string[]).includes(v)

export const ICON_VARIANT_LABEL: Record<IconVariant, string> = { clasico: 'Atardecer', noche: 'Noche', neon: 'Neón' }

/** Índices de color del mapa. */
const enum C {
  Bg1 = 1, // fondo arriba
  Bg2, // fondo medio
  Bg3, // fondo abajo
  Star, // estrellitas
  Outline, // contorno de los auriculares
  Body, // blanco principal
  Shade, // sombra del plástico
  Shine, // brillo
  Grill, // rejilla del parlante
  Tip, // micrófono en la punta
  Note // notas musicales
}

type Palette = Record<C, string>

export const ICON_PALETTES: Record<IconVariant, Palette> = {
  clasico: {
    [C.Bg1]: '#6c5ce7', [C.Bg2]: '#6c5ce7', [C.Bg3]: '#6c5ce7', [C.Star]: '#ffffff',
    [C.Outline]: '#2b2366', [C.Body]: '#ffffff', [C.Shade]: '#d5d2f5', [C.Shine]: '#ffffff',
    [C.Grill]: '#2b2366', [C.Tip]: '#a9a3e6', [C.Note]: '#ffffff'
  },
  noche: {
    [C.Bg1]: '#141414', [C.Bg2]: '#141414', [C.Bg3]: '#141414', [C.Star]: '#d9a35b',
    [C.Outline]: '#000000', [C.Body]: '#ececec', [C.Shade]: '#a9a9a9', [C.Shine]: '#ffffff',
    [C.Grill]: '#2a2a2a', [C.Tip]: '#7a7a7a', [C.Note]: '#d9a35b'
  },
  neon: {
    [C.Bg1]: '#120a24', [C.Bg2]: '#120a24', [C.Bg3]: '#120a24', [C.Star]: '#39ff14',
    [C.Outline]: '#ff2bd6', [C.Body]: '#f4f0ff', [C.Shade]: '#b3a6dd', [C.Shine]: '#ffffff',
    [C.Grill]: '#1b1036', [C.Tip]: '#00f0ff', [C.Note]: '#39ff14'
  }
}

export const ICON_SIZE = 32

/** Mapa 32×32 de índices de color (0 = transparente). */
export function iconPixels(): number[][] {
  const g = Array.from({ length: ICON_SIZE }, () => Array<number>(ICON_SIZE).fill(0))
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < ICON_SIZE && y < ICON_SIZE) g[y]![x] = c
  }
  const rect = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c)
  }

  // Fondo liso y minimalista: un solo color, sin texturas.
  rect(0, 0, ICON_SIZE, ICON_SIZE, C.Bg1)

  /**
   * Un auricular inalámbrico: cabeza ovalada con la rejilla del parlante hacia afuera y el
   * palito colgando del lado interno (no del centro). `flip` lo espeja (el derecho).
   */
  const bud = (ox: number, oy: number, flip: boolean) => {
    const art = [
      '..XXXXX..',
      '.XWWWWWX.',
      'XWWHWWWWX',
      'XGGWWWWWX',
      'XGGWWWWSX',
      '.XWWWWWSX',
      '..XXWWSSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XWWSX',
      '....XTTTX',
      '.....XXX.'
    ]
    const colors: Record<string, number> = { X: C.Outline, W: C.Body, S: C.Shade, H: C.Shine, G: C.Grill, T: C.Tip }
    art.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = colors[ch]
        if (c) set(flip ? ox + (8 - x) : ox + x, oy + y, c)
      })
    )
  }
  // Centrados: el par ocupa del x=5 al x=26.
  bud(5, 6, false)
  bud(18, 9, true)

  // Un único acento: una nota musical chica arriba, entre los dos.
  rect(16, 2, 1, 4, C.Note)
  set(17, 2, C.Note), set(18, 3, C.Note)
  rect(14, 5, 2, 2, C.Note), set(16, 6, C.Note)
  return g
}
