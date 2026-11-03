import { useEffect, useMemo, useRef, useState } from 'react'
import { buildHeatmap, HEAT_THRESHOLDS_MIN, type HeatLevel } from '@shared/heatmap'
import type { DayTotal } from '@shared/streaks'
import { toLocalDate } from '@shared/domain'
import { parseLocalDate } from '@shared/dates'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { useChartTooltip } from './ChartTooltip'

// Clases literales: Tailwind no detecta nombres armados dinámicamente.
const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4 arcade:shadow-[0_0_6px_var(--heat-4)]'
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['Lun', '', 'Mié', '', 'Vie', '', '']
const GAP = 3
const LABEL_W = 32
const fullDate = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * Mapa de calor anual estilo GitHub (semanas en columnas, lunes arriba).
 * Secuencial de un solo tono por tema (tokens --heat-0…4), con leyenda de escala.
 */
export function Heatmap({ totals, end = toLocalDate() }: { totals: DayTotal[]; end?: string }) {
  const grid = useMemo(() => buildHeatmap(totals, end), [totals, end])
  const { containerRef, show, hide, node } = useChartTooltip()
  const scrollRef = useRef<HTMLDivElement>(null)
  // El tamaño de celda se adapta al ancho disponible (8–14 px); por debajo de 8 px, scroll horizontal.
  const [CELL, setCell] = useState(12)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry!.contentRect.width - LABEL_W - 12
      setCell(Math.max(8, Math.min(14, Math.floor(w / grid.weeks.length - GAP))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [grid.weeks.length])

  // Muestra las semanas más recientes si el contenedor es angosto.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [grid])

  const studiedDays = totals.filter((t) => t.seconds >= 60 && t.localDate <= end).length
  const width = grid.weeks.length * (CELL + GAP)

  return (
    <div ref={containerRef} className="relative">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col pr-3" style={{ minWidth: width + LABEL_W }}>
          {/* Meses */}
          <div className="relative h-4 text-[10px] text-fg-subtle" style={{ width, marginLeft: LABEL_W }}>
            {grid.months.map((m) => (
              <span key={`${m.year}-${m.month}`} className="absolute" style={{ left: m.column * (CELL + GAP) }}>
                {MONTHS[m.month]}
              </span>
            ))}
          </div>
          <div className="flex">
            {/* Días de la semana */}
            <div className="flex flex-col text-[10px] text-fg-subtle" style={{ gap: GAP, width: LABEL_W }}>
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="leading-none" style={{ height: CELL, lineHeight: `${CELL}px` }}>
                  {d}
                </span>
              ))}
            </div>
            <div
              className="flex"
              style={{ gap: GAP }}
              role="img"
              aria-label={`Mapa de calor: ${studiedDays} días con estudio en el último año`}
              onMouseLeave={hide}
            >
              {grid.weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((cell) => (
                    <span
                      key={cell.date}
                      className={cn(
                        'rounded-[3px] transition-[outline] hover:outline-2 hover:outline-offset-1 hover:outline-fg-muted',
                        cell.inRange ? LEVEL_CLASS[cell.level] : 'opacity-0'
                      )}
                      style={{ width: CELL, height: CELL }}
                      onMouseEnter={(e) =>
                        cell.inRange &&
                        show(e.currentTarget, {
                          value: cell.seconds >= 60 ? formatDuration(cell.seconds) : 'Sin estudio',
                          label: fullDate.format(new Date(parseLocalDate(cell.date)))
                        })
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-fg-subtle">
        <span>
          {studiedDays} {studiedDays === 1 ? 'día' : 'días'} con estudio
        </span>
        <span
          className="flex items-center gap-1"
          title={`Niveles: menos de ${HEAT_THRESHOLDS_MIN[1]} min · ${HEAT_THRESHOLDS_MIN[1]}–${HEAT_THRESHOLDS_MIN[2]} min · 1–2 h · más de 2 h`}
        >
          Menos
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span key={l} className={cn('rounded-[3px]', LEVEL_CLASS[l])} style={{ width: 10, height: 10 }} />
          ))}
          Más
        </span>
      </div>
      {node}
    </div>
  )
}
