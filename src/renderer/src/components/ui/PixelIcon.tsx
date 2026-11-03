import { useMemo } from 'react'
import { ICON_PALETTES, ICON_SIZE, iconPixels, type IconVariant } from '@shared/pixelIcon'
import { cn } from '@/lib/cn'

const PIXELS = iconPixels()

/**
 * Logo de la app como SVG nítido (mismo mapa de pixeles que el ícono del sistema).
 * Agrupa los pixeles contiguos de cada fila en un solo rect para mantener el DOM liviano.
 */
export function PixelIcon({ variant = 'clasico', size = 32, className, title }: { variant?: IconVariant; size?: number; className?: string; title?: string }) {
  const rects = useMemo(() => {
    const pal = ICON_PALETTES[variant] as Record<number, string>
    const out: { x: number; y: number; w: number; fill: string }[] = []
    PIXELS.forEach((row, y) => {
      let x = 0
      while (x < ICON_SIZE) {
        const c = row[x]!
        let w = 1
        while (x + w < ICON_SIZE && row[x + w] === c) w++
        if (c) out.push({ x, y, w, fill: pal[c]! })
        x += w
      }
    })
    return out
  }, [variant])

  return (
    <svg
      viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0 rounded-[22%]', className)}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}
