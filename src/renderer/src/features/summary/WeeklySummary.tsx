import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CalendarClock, ChevronLeft, ChevronRight, Flame, Layers, TrendingDown, TrendingUp, X } from 'lucide-react'
import { isMilestoneKind, toLocalDate } from '@shared/domain'
import { addDays, parseLocalDate } from '@shared/dates'
import type { AppSettings } from '@shared/settings'
import { summarizeWeek, weekStartOf, weekToSummarize } from '@shared/weeklySummary'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDuration, formatHours, relativeDays } from '@/lib/format'
import { dialog, fade } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { KIND_LABEL } from '@/lib/eventKinds'
import { useSettings, useStreak } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'

const OPEN_EVENT = 'studentos:weekly-summary'
/** Abre el resumen de una semana (por defecto, la que corresponde resumir ahora). */
export const openWeeklySummary = (weekStart?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: weekStart }))

const shortFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLetter = new Intl.DateTimeFormat('es', { weekday: 'narrow', timeZone: 'UTC' })
const longDay = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: 'UTC' })
const utc = (d: string) => new Date(parseLocalDate(d))

/** Se monta una vez (en AppShell): se abre solo una vez por semana o a pedido. */
export function WeeklySummary() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const [week, setWeek] = useState<string | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) => setWeek((e as CustomEvent<string | undefined>).detail ?? weekToSummarize(new Date()))
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Apertura automática: una vez por semana, y solo si ya usabas la app esa semana.
  useEffect(() => {
    if (!settings?.onboarding.completedAt || !settings.weeklySummary.auto) return
    const target = weekToSummarize(new Date())
    if (settings.weeklySummary.lastShown && settings.weeklySummary.lastShown >= target) return
    const startedUsing = toLocalDate(new Date(settings.onboarding.completedAt))
    if (startedUsing > addDays(target, 6)) return
    void api.stats.range(target, addDays(target, 6)).then((r) => {
      const next = { ...settings.weeklySummary, lastShown: target }
      qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, weeklySummary: next } : s))
      void api.settings.set('weeklySummary', next)
      // Una semana sin nada estudiado no se muestra sola (se puede abrir desde Estadísticas).
      if (r.daily.some((d) => d.seconds >= 60)) setWeek(target)
    })
  }, [settings, qc])

  return <AnimatePresence>{week && <SummaryDialog key="summary" week={week} onWeek={setWeek} onClose={() => setWeek(null)} />}</AnimatePresence>
}

function SummaryDialog({ week, onWeek, onClose }: { week: string; onWeek: (w: string) => void; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { data: subjects = [] } = useSubjects()
  const { data: streak } = useStreak()
  const color = useSubjectColor()
  const weekEnd = addDays(week, 6)
  const prevStart = addDays(week, -7)
  const isCurrent = week === weekStartOf(toLocalDate())

  const sessions = useQuery({ queryKey: [...queryKeys.stats, 'sessions', week, weekEnd], queryFn: () => api.sessions.list(week, weekEnd) })
  const prev = useQuery({ queryKey: queryKeys.statsRange(prevStart, addDays(prevStart, 6), null), queryFn: () => api.stats.range(prevStart, addDays(prevStart, 6)) })
  const upcoming = useQuery({
    queryKey: [...queryKeys.events, 'summary-next'],
    queryFn: () => {
      const now = new Date()
      return api.events.listRange({ from: now, to: new Date(now.getTime() + 7 * 86_400_000) })
    }
  })
  const deck = useQuery({ queryKey: ['flashcards', null], queryFn: () => api.flashcards.deck(null), staleTime: 0 })

  const s = useMemo(
    () =>
      sessions.data && prev.data
        ? summarizeWeek({
            weekStart: week,
            sessions: sessions.data,
            prevTotalSeconds: prev.data.daily.reduce((a, d) => a + d.seconds, 0),
            subjects
          })
        : null,
    [sessions.data, prev.data, subjects, week]
  )
  const maxDay = Math.max(1, ...(s?.days.map((d) => d.seconds) ?? [0]))
  const milestones = (upcoming.data ?? []).filter((e) => isMilestoneKind(e.kind) && !e.completedAt)

  const setAuto = (auto: boolean) => {
    if (!settings) return
    const next = { ...settings.weeklySummary, auto }
    qc.setQueryData<AppSettings>(queryKeys.settings, (x) => (x ? { ...x, weeklySummary: next } : x))
    void api.settings.set('weeklySummary', next)
  }

  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <motion.div
        variants={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'ArrowLeft') onWeek(prevStart)
          if (e.key === 'ArrowRight' && !isCurrent) onWeek(addDays(week, 7))
        }}
        tabIndex={-1}
        style={{ backgroundColor: 'var(--surface)' }}
        className="max-h-[90vh] w-[560px] overflow-y-auto rounded-[14px] border border-line shadow-2xl focus:outline-none"
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <Button size="icon" variant="ghost" aria-label="Semana anterior" onClick={() => onWeek(prevStart)}>
            <ChevronLeft size={16} />
          </Button>
          <div className="flex-1 text-center">
            <h2 id="summary-title" className="font-display text-base font-semibold">
              {isCurrent ? 'Tu semana' : 'Resumen semanal'}
            </h2>
            <p className="text-xs text-fg-muted">
              {shortFmt.format(utc(week))} – {shortFmt.format(utc(weekEnd))}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Semana siguiente" disabled={isCurrent} onClick={() => onWeek(addDays(week, 7))}>
            <ChevronRight size={16} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {!s ? (
          <p className="p-8 text-center text-sm text-fg-subtle">Cargando…</p>
        ) : (
          <div className="space-y-5 p-5">
            {/* Total y comparación */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-5xl leading-none font-semibold tracking-tight arcade:text-glow arcade:text-accent">{formatHours(s.totalSeconds)}</p>
                <p className="mt-1.5 text-xs text-fg-muted">
                  {s.totalSeconds ? `de foco en ${s.daysStudied} ${s.daysStudied === 1 ? 'día' : 'días'} · ${s.sessions} sesiones` : 'Esta semana no registraste estudio'}
                </p>
              </div>
              {s.delta !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                    s.delta >= 0 ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger'
                  )}
                  title={`Semana anterior: ${formatDuration(s.prevTotalSeconds)}`}
                >
                  {s.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {s.delta >= 0 ? '+' : ''}
                  {Math.round(s.delta * 100)} % vs. la anterior
                </span>
              )}
            </div>

            {/* Días */}
            <div className="grid grid-cols-7 items-end gap-1.5" aria-label="Horas por día">
              {s.days.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1" title={`${longDay.format(utc(d.date))}: ${d.seconds >= 60 ? formatDuration(d.seconds) : 'sin estudio'}`}>
                  <div className="flex h-20 w-full items-end">
                    <div
                      className={cn('w-full rounded-t-[4px]', s.bestDay?.date === d.date ? 'bg-success' : d.seconds >= 60 ? 'bg-accent' : 'bg-surface-2')}
                      style={{ height: `${Math.max(6, (d.seconds / maxDay) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-fg-subtle uppercase">{dayLetter.format(utc(d.date))}</span>
                </div>
              ))}
            </div>

            {/* Cifras */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Mejor día" value={s.bestDay ? longDay.format(utc(s.bestDay.date)) : '—'} hint={s.bestDay ? formatDuration(s.bestDay.seconds) : undefined} />
              <Stat label="Foco promedio" value={s.avgFocus === null ? '—' : `${Math.round(s.avgFocus * 100)} %`} hint={s.avgFocus === null ? 'calificá tus sesiones' : undefined} />
              <Stat
                label="Racha"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Flame size={14} className="text-warning" fill="currentColor" /> {streak?.current ?? 0}
                  </span>
                }
                hint={`mejor: ${streak?.longest ?? 0}`}
              />
            </div>

            {/* Materias */}
            {s.subjects.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold text-fg-muted uppercase">
                  Por materia
                  {s.goalsTotal > 0 && (
                    <span className="font-normal normal-case">
                      {s.goalsMet} de {s.goalsTotal} metas cumplidas
                    </span>
                  )}
                </h3>
                <ul className="space-y-2">
                  {s.subjects.map((r) => {
                    const c = r.color ? color(r.color) : 'var(--fg-subtle)'
                    const scale = r.goalSeconds ?? Math.max(...s.subjects.map((x) => x.seconds), 1)
                    const pct = Math.min(1, r.seconds / scale)
                    const met = r.goalSeconds !== null && r.seconds >= r.goalSeconds
                    return (
                      <li key={r.id ?? 'none'}>
                        <div className="mb-0.5 flex justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                            <span className="truncate">{r.name}</span>
                            {met && <span className="text-success">✓</span>}
                          </span>
                          <span className="shrink-0 text-fg-muted tabular-nums">
                            {formatDuration(r.seconds)}
                            {r.goalSeconds !== null && ` / ${formatDuration(r.goalSeconds)}`}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: met ? 'var(--success)' : c }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Lo que viene */}
            <div className="rounded-card bg-surface-2/60 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase">
                <CalendarClock size={13} /> Próximos 7 días
              </h3>
              {milestones.length ? (
                <ul className="space-y-1 text-sm">
                  {milestones.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <span className="font-medium">{KIND_LABEL[e.kind]}</span> · {e.title}
                      </span>
                      <span className="shrink-0 text-xs text-fg-muted">{relativeDays(e.startsAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-subtle">Sin parciales ni entregas cargados.</p>
              )}
              {deck.data && deck.data.due.length > 0 && (
                <Link to="/repaso" onClick={onClose} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                  <Layers size={13} /> {deck.data.due.length} tarjetas para repasar
                </Link>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-[var(--accent)]" checked={settings?.weeklySummary.auto ?? true} onChange={(e) => setAuto(e.target.checked)} />
                Abrirlo solo cada semana
              </label>
              <Button variant="primary" autoFocus onClick={onClose}>
                Listo
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-card border border-line px-2 py-2.5">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold first-letter:uppercase">{value}</p>
      {hint && <p className="text-[10px] text-fg-subtle">{hint}</p>}
    </div>
  )
}
