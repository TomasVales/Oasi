import { useMemo } from 'react'
import type { DayTotal } from '@shared/streaks'
import { addDays, diffDays, parseLocalDate } from '@shared/dates'
import { formatDuration } from '@/lib/format'
import { useChartTooltip } from './ChartTooltip'

const dayLabel = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullLabel = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Paso "limpio" para el eje Y en horas. */
function niceStep(maxHours: number): number {
  for (const s of [0.5, 1, 2, 3, 4, 6, 8]) if (maxHours / s <= 4) return s
  return 12
}

/**
 * Columnas de horas por día (una sola serie: sin leyenda, el título la nombra).
 * Grilla en línea fina, etiqueta solo en el máximo y tooltip por columna.
 */
export function DailyColumns({ totals, from, to, height = 160 }: { totals: DayTotal[]; from: string; to: string; height?: number }) {
  const { containerRef, show, hide, node } = useChartTooltip()
  const days = useMemo(() => {
    const map = new Map(totals.map((t) => [t.localDate, t.seconds]))
    const n = diffDays(to, from) + 1
    return Array.from({ length: n }, (_, i) => {
      const date = addDays(from, i)
      return { date, seconds: map.get(date) ?? 0 }
    })
  }, [totals, from, to])

  const maxSec = Math.max(...days.map((d) => d.seconds), 0)
  const step = niceStep(Math.max(maxSec / 3600, 0.5))
  const top = Math.max(step, Math.ceil(maxSec / 3600 / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const maxIdx = maxSec > 0 ? days.findIndex((d) => d.seconds === maxSec) : -1
  const labelEvery = Math.ceil(days.length / 7)

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        {/* Eje Y */}
        <div className="relative w-9 shrink-0 text-[10px] text-fg-subtle tabular-nums" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: height - (t / top) * height }}>
              {t} h
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={hide}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ top: height - (t / top) * height }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-between gap-[2px] px-0.5">
            {days.map((d, i) => {
              const h = (d.seconds / 3600 / top) * height
              return (
                <div
                  key={d.date}
                  className="group relative flex h-full max-w-6 flex-1 items-end justify-center"
                  onMouseEnter={(e) =>
                    show(e.currentTarget.firstElementChild ?? e.currentTarget, {
                      value: d.seconds ? formatDuration(d.seconds) : 'Sin estudio',
                      label: fullLabel.format(new Date(parseLocalDate(d.date)))
                    })
                  }
                >
                  <div
                    className="w-full rounded-t-[4px] bg-accent group-hover:brightness-110 arcade:shadow-[0_0_8px_var(--accent)]"
                    style={{ height: d.seconds ? Math.max(2, h) : 0 }}
                  />
                  {i === maxIdx && (
                    <span className="absolute text-[10px] font-semibold whitespace-nowrap text-fg" style={{ bottom: h + 3 }}>
                      {formatDuration(d.seconds)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* Eje X: etiquetas espaciadas */}
      <div className="ml-9 flex justify-between gap-[2px] px-0.5 pt-1 text-[10px] text-fg-subtle">
        {days.map((d, i) => (
          <span key={d.date} className="max-w-6 flex-1 overflow-visible text-center whitespace-nowrap">
            {i % labelEvery === 0 ? dayLabel.format(new Date(parseLocalDate(d.date))) : ''}
          </span>
        ))}
      </div>
      {node}
    </div>
  )
}
