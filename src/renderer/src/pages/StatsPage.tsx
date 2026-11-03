import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { ChartColumn, Table2 } from 'lucide-react'
import { toLocalDate } from '@shared/domain'
import { addDays, diffDays } from '@shared/dates'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDuration, formatHours } from '@/lib/format'
import { queryKeys } from '@/lib/queryClient'
import { useStreak } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { DailyColumns } from '@/components/charts/DailyColumns'
import { Heatmap } from '@/components/charts/Heatmap'
import { SubjectBars } from '@/components/charts/SubjectBars'

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 120, label: 'Cuatrimestre' },
  { days: 365, label: 'Año' }
]

export function StatsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const subjectId = params.get('subject')
  const [days, setDays] = useState(30)
  const [table, setTable] = useState(false)
  const { data: subjects = [] } = useSubjects(true)
  const { data: streak } = useStreak()

  const to = toLocalDate()
  const from = addDays(to, -(days - 1))
  const stats = useQuery({
    queryKey: queryKeys.statsRange(from, to, subjectId),
    queryFn: () => api.stats.range(from, to, subjectId)
  })
  const year = useQuery({
    queryKey: queryKeys.statsRange(addDays(to, -380), to, subjectId),
    queryFn: () => api.stats.range(addDays(to, -380), to, subjectId)
  })

  const daily = stats.data?.daily ?? []
  const total = daily.reduce((a, d) => a + d.seconds, 0)
  const studied = daily.filter((d) => d.seconds >= 60).length
  const bars = useMemo(
    () =>
      (stats.data?.bySubject ?? [])
        .filter((s) => s.seconds > 0)
        .map((s) => ({
          id: s.subjectId ?? 'none',
          name: s.name ?? 'Sin materia',
          color: s.color ?? '#808080',
          seconds: s.seconds
        })),
    [stats.data]
  )
  // Columnas diarias: máximo 90 para que sigan siendo legibles.
  const colFrom = diffDays(to, from) > 89 ? addDays(to, -89) : from

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-8 py-7">
        {/* Filtros: una fila, arriba de todo; afectan todo lo de abajo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-card bg-surface-2 p-1" role="radiogroup" aria-label="Período">
            {RANGES.map((r) => (
              <button
                key={r.days}
                role="radio"
                aria-checked={days === r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'h-7 rounded-[calc(var(--radius)-2px)] px-3 text-xs font-medium',
                  days === r.days ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Materia"
            value={subjectId ?? ''}
            onChange={(e) => navigate(e.target.value ? `/estadisticas?subject=${e.target.value}` : '/estadisticas')}
            className="h-9 rounded-card border border-line bg-surface px-2 text-xs focus:border-accent focus:outline-none"
          >
            <option value="">Todas las materias</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <button
            onClick={() => setTable((v) => !v)}
            aria-pressed={table}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-card px-2.5 text-xs',
              table ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            )}
          >
            <Table2 size={14} /> {table ? 'Ver gráficos' : 'Ver tabla'}
          </button>
        </div>

        {/* Indicadores: una sola cifra protagonista */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="col-span-2 flex flex-col justify-between p-4 md:row-span-2">
            <p className="text-xs text-fg-muted">Horas estudiadas</p>
            <p className="mt-1 text-6xl font-semibold tracking-tight arcade:text-glow arcade:text-accent">{formatHours(total)}</p>
            <p className="text-xs text-fg-subtle">en {RANGES.find((r) => r.days === days)?.label.toLowerCase()}</p>
          </Card>
          <Stat label="Promedio por día estudiado" value={studied ? formatDuration(Math.round(total / studied)) : '—'} />
          <Stat label="Días con estudio" value={`${studied} de ${days}`} />
          <Stat label="Racha actual" value={`${streak?.current ?? 0} días`} />
          <Stat label="Mejor racha" value={`${streak?.longest ?? 0} días`} />
        </div>

        {total === 0 && !stats.isLoading ? (
          <Card>
            <EmptyState
              icon={ChartColumn}
              title="Todavía no hay sesiones en este período"
              description="Cuando uses el cronómetro de estudio, acá vas a ver el desglose de horas."
            />
          </Card>
        ) : table ? (
          <DataTables daily={daily} bars={bars} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Horas por materia" />
              <div className="px-4 pb-4">
                <SubjectBars data={bars} highlightId={subjectId} />
              </div>
            </Card>
            <Card>
              <CardHeader title={`Horas por día${colFrom !== from ? ' · últimos 90' : ''}`} />
              <div className="px-4 pb-4">
                <DailyColumns totals={daily} from={colFrom} to={to} />
              </div>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader title="Actividad del último año" />
          <div className="px-4 pb-4">
            <Heatmap totals={year.data?.daily ?? []} end={to} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </Card>
  )
}

function DataTables({ daily, bars }: { daily: { localDate: string; seconds: number }[]; bars: { id: string; name: string; seconds: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <table className="selectable w-full text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Materia</th>
              <th className="px-4 py-2 text-right font-medium">Tiempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bars.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">{b.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDuration(b.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="max-h-96 overflow-auto">
        <table className="selectable w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Día</th>
              <th className="px-4 py-2 text-right font-medium">Tiempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...daily].reverse().map((d) => (
              <tr key={d.localDate}>
                <td className="px-4 py-2 tabular-nums">{d.localDate}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDuration(d.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
