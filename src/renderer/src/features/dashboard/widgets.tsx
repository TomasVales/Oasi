import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CalendarClock, Clock3, Flame, Grid3x3, Sparkles, Sun, Trophy, type LucideIcon } from 'lucide-react'
import { toLocalDate } from '@shared/domain'
import { addDays } from '@shared/dates'
import type { DashboardWidget } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatCountdown, formatDuration, longDayFmt, relativeDays, timeFmt } from '@/lib/format'
import { queryKeys } from '@/lib/queryClient'
import { useCheckInToday, useSettings, useStreak, useUpcomingEvents } from '@/hooks/useAppData'
import { useNow } from '@/hooks/useNow'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Heatmap } from '@/components/charts/Heatmap'
import { KIND_LABEL, useNextEvent } from '@/components/layout/Countdown'
import { PlanSection } from './PlanSection'

export interface WidgetDef {
  title: string
  icon: LucideIcon
  /** Columnas que ocupa en la grilla de 3 (en pantallas anchas). */
  span: 1 | 2 | 3
  Body: () => React.ReactElement
}

function CountdownWidget() {
  const now = useNow(1000)
  const next = useNextEvent(now)
  if (!next) return <p className="text-sm text-fg-subtle">Sin eventos próximos.</p>
  return (
    <div>
      <p className="text-[11px] font-semibold text-fg-muted uppercase">{KIND_LABEL[next.kind]}</p>
      <p className="truncate font-semibold">{next.title}</p>
      <p className="mt-1 font-mono text-[28px] leading-tight font-bold tracking-tight tabular-nums arcade:text-glow arcade:text-accent">
        {formatCountdown(next.startsAt.getTime() - now.getTime())}
      </p>
      <p className="text-xs text-fg-subtle">
        {longDayFmt.format(next.startsAt)} · {timeFmt.format(next.startsAt)}
      </p>
    </div>
  )
}

function StreakWidget() {
  const { data: streak } = useStreak()
  const current = streak?.current ?? 0
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center gap-3">
        <Flame size={34} className={cn(current ? 'text-warning arcade:text-accent-2' : 'text-fg-subtle')} fill={current ? 'currentColor' : 'none'} />
        <div>
          <p className="text-3xl leading-none font-bold">
            {current} <span className="text-sm font-medium text-fg-muted">{current === 1 ? 'día' : 'días'}</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
            <Trophy size={12} /> Mejor racha: {streak?.longest ?? 0}
          </p>
        </div>
      </div>
      {streak && !streak.studiedToday && <p className="text-xs text-fg-subtle">Estudiá {streak.minutesLeftToday} min más hoy para sumar el día.</p>}
    </div>
  )
}

function MilestonesWidget() {
  const { data: events } = useUpcomingEvents()
  const { data: subjects } = useSubjects()
  const color = useSubjectColor()
  const milestones = (events ?? []).filter((e) => e.kind !== 'class' && !e.completedAt).slice(0, 5)
  if (!milestones.length)
    return (
      <p className="text-sm text-fg-subtle">
        Cargá parciales y entregas en{' '}
        <Link to="/calendario" className="text-accent hover:underline">
          Calendario
        </Link>
        .
      </p>
    )
  return (
    <ul className="-mx-1.5 space-y-0.5">
      {milestones.map((e) => {
        const s = subjects?.find((x) => x.id === e.subjectId)
        return (
          <li key={e.id} className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-hover">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold text-white"
              style={{ background: s ? color(s.color) : 'var(--fg-subtle)' }}
            >
              {e.startsAt.getDate()}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium">{e.title}</p>
              <p className="truncate text-[11px] text-fg-muted">
                {KIND_LABEL[e.kind]} · {relativeDays(e.startsAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Resumen del día: tiempo de foco hoy contra el mínimo de la racha y energía declarada. */
function TodayWidget() {
  const today = toLocalDate()
  const { data } = useQuery({ queryKey: queryKeys.statsRange(today, today, null), queryFn: () => api.stats.range(today, today) })
  const { data: settings } = useSettings()
  const { data: checkIn } = useCheckInToday()
  const seconds = data?.daily[0]?.seconds ?? 0
  const goal = (settings?.streakMinMinutes ?? 15) * 60
  const pct = Math.min(1, seconds / goal)
  const energy = { low: 'baja', medium: 'media', high: 'alta' } as const
  return (
    <div className="space-y-3">
      <div>
        <p className="text-3xl leading-none font-bold">{seconds >= 60 ? formatDuration(seconds) : '0 min'}</p>
        <p className="mt-1 text-xs text-fg-muted">de foco hoy</p>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full', pct >= 1 ? 'bg-success' : 'bg-accent')} style={{ width: `${pct * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-fg-subtle">{pct >= 1 ? 'Hoy ya suma a la racha ✓' : `Meta diaria de la racha: ${goal / 60} min`}</p>
      </div>
      {checkIn && <p className="text-xs text-fg-muted">Energía declarada: {energy[checkIn.energy]}</p>}
    </div>
  )
}

function HeatmapWidget() {
  const end = toLocalDate()
  const year = useQuery({
    queryKey: queryKeys.statsRange(addDays(end, -380), end, null),
    queryFn: () => api.stats.range(addDays(end, -380), end)
  })
  return <Heatmap totals={year.data?.daily ?? []} end={end} />
}

export const WIDGETS: Record<DashboardWidget, WidgetDef> = {
  plan: { title: 'Tu plan', icon: Sparkles, span: 2, Body: PlanSection },
  countdown: { title: 'Cuenta regresiva', icon: Clock3, span: 1, Body: CountdownWidget },
  streak: { title: 'Racha', icon: Flame, span: 1, Body: StreakWidget },
  milestones: { title: 'Próximos hitos', icon: CalendarClock, span: 1, Body: MilestonesWidget },
  today: { title: 'Hoy', icon: Sun, span: 1, Body: TodayWidget },
  heatmap: { title: 'Actividad del último año', icon: Grid3x3, span: 3, Body: HeatmapWidget }
}
