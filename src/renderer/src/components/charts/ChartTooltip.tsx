import { useCallback, useRef, useState } from 'react'

export interface TooltipContent {
  value: string
  label: string
  /** Color de la marca (clave de línea corta, nunca el texto). */
  key?: string
}

/**
 * Tooltip flotante único por gráfico: el valor es lo destacado y la etiqueta lo secundario.
 * Se posiciona relativo al contenedor del gráfico; el texto se inserta como texto (no HTML).
 */
export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<(TooltipContent & { x: number; y: number }) | null>(null)

  const show = useCallback((el: Element, content: TooltipContent) => {
    const box = containerRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!box) return
    setTip({ ...content, x: r.left + r.width / 2 - box.left, y: r.top - box.top })
  }, [])
  const hide = useCallback(() => setTip(null), [])

  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-[6px] bg-tooltip px-2.5 py-1.5 text-tooltip-fg shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{tip.value}</p>
      <p className="flex items-center gap-1.5 text-[11px] whitespace-nowrap opacity-75">
        {tip.key && <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: tip.key }} />}
        {tip.label}
      </p>
    </div>
  )

  return { containerRef, show, hide, node }
}
