import { formatHours, formatDuration } from '@/lib/format'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { cn } from '@/lib/cn'
import { useChartTooltip } from './ChartTooltip'

export interface SubjectBarDatum {
  id: string
  name: string
  color: string
  seconds: number
}

/**
 * Barras horizontales: horas por materia. Cada barra es una categoría con su nombre
 * al costado (identidad nunca solo por color) y el valor en la punta.
 */
export function SubjectBars({ data, highlightId }: { data: SubjectBarDatum[]; highlightId?: string | null }) {
  const color = useSubjectColor()
  const { containerRef, show, hide, node } = useChartTooltip()
  const max = Math.max(1, ...data.map((d) => d.seconds))
  const total = data.reduce((a, d) => a + d.seconds, 0)

  return (
    <div ref={containerRef} className="relative space-y-2.5" onMouseLeave={hide}>
      {data.map((d) => (
        <div
          key={d.id}
          className={cn(
            'grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3',
            highlightId && highlightId !== d.id && 'opacity-45'
          )}
        >
          <span className="truncate text-right text-[13px] text-fg-muted" title={d.name}>
            {d.name}
          </span>
          <div className="flex min-w-0 items-center gap-2">
            {/* Barra ≤ 24 px, extremo redondeado de 4 px y base recta */}
            <div
              tabIndex={0}
              className="h-5 min-w-[3px] rounded-r-[4px] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-fg-muted"
              style={{ width: `${(d.seconds / max) * 82}%`, background: color(d.color) }}
              onMouseEnter={(e) =>
                show(e.currentTarget, {
                  value: formatDuration(d.seconds),
                  label: `${d.name} · ${total ? Math.round((d.seconds / total) * 100) : 0}% del total`,
                  key: color(d.color)
                })
              }
              onFocus={(e) => show(e.currentTarget, { value: formatDuration(d.seconds), label: d.name, key: color(d.color) })}
              onBlur={hide}
            />
            <span className="shrink-0 text-xs font-medium text-fg tabular-nums">{formatHours(d.seconds)}</span>
          </div>
        </div>
      ))}
      {node}
    </div>
  )
}
