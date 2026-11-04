import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Columns3, LayoutGrid, List, Trash2 } from 'lucide-react'
import { isMilestoneKind, LIFE_EVENT_KINDS, toLocalDate, UNI_EVENT_KINDS, type EventKind } from '@shared/domain'
import type { CalendarEvent, Subject } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { relativeDays, timeFmt } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { KIND_GROUPS, KIND_LABEL, KIND_META } from '@/lib/eventKinds'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Field'

const monthFmt = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat('es', { weekday: 'short' })
const weekTitleFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const longDayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })
const WEIGHT_LABEL = ['', 'Menor', 'Baja', 'Normal', 'Alta', 'Crítica']
const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

type View = 'list' | 'week' | 'month'
type Scope = 'all' | 'uni' | 'life'

const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: 'list', label: 'Lista', icon: List },
  { id: 'week', label: 'Semana', icon: Columns3 },
  { id: 'month', label: 'Mes', icon: LayoutGrid }
]
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'uni', label: 'Facultad' },
  { id: 'life', label: 'Fuera de la facu' }
]

// ─── Fechas ──────────────────────────────────────────────────────────────────
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDaysTo = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** Lunes de la semana de `d`. */
const startOfWeek = (d: Date) => addDaysTo(startOfDay(d), -((d.getDay() + 6) % 7))
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Días que cubre la vista (semana: 7; mes: semanas completas que contienen el mes). */
function visibleDays(view: View, anchor: Date): Date[] {
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDaysTo(startOfWeek(anchor), i))
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const from = startOfWeek(first)
  const count = Math.ceil((addDaysTo(startOfWeek(last), 7).getTime() - from.getTime()) / 86_400_000)
  return Array.from({ length: Math.round(count) }, (_, i) => addDaysTo(from, i))
}

const kindsFor = (scope: Scope, classes: boolean): EventKind[] => {
  const base = scope === 'uni' ? [...UNI_EVENT_KINDS] : scope === 'life' ? [...LIFE_EVENT_KINDS] : [...UNI_EVENT_KINDS, ...LIFE_EVENT_KINDS]
  return classes ? base : base.filter((k) => k !== 'class')
}

export function CalendarPage() {
  const [params] = useSearchParams()
  const subjectFilter = params.get('subject')
  const [view, setView] = usePersistentState<View>('calendar.view', 'list')
  const [scope, setScope] = usePersistentState<Scope>('calendar.scope', 'all')
  const [showClasses, setShowClasses] = usePersistentState('calendar.classes', false)
  const [showPast, setShowPast] = useState(false)
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState<Date | null>(null)
  const [draftDate, setDraftDate] = useState<string | null>(null)
  const qc = useQueryClient()
  const { data: subjects = [] } = useSubjects()
  const color = useSubjectColor()

  const days = useMemo(() => (view === 'list' ? [] : visibleDays(view, anchor)), [view, anchor])
  const kinds = kindsFor(scope, showClasses || view !== 'list')

  const events = useQuery({
    queryKey: [...queryKeys.events, 'calendar', view, view === 'list' ? showPast : days[0]?.getTime(), kinds.join(',')],
    queryFn: () => {
      if (view !== 'list') {
        return api.events.listRange({ from: days[0]!, to: addDaysTo(days[days.length - 1]!, 1), kinds })
      }
      const now = new Date()
      return api.events.listRange({
        from: showPast ? new Date(now.getTime() - 180 * 86_400_000) : startOfDay(now),
        to: new Date(now.getTime() + (showClasses ? 21 : 365) * 86_400_000),
        kinds
      })
    }
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.events })
    void qc.invalidateQueries({ queryKey: queryKeys.plan })
  }
  const toggleDone = useMutation({
    mutationFn: (e: CalendarEvent) => api.events.update(e.id, { completedAt: e.completedAt ? null : new Date() }),
    onSuccess: invalidate
  })
  const remove = useMutation({ mutationFn: (id: string) => api.events.remove(id), onSuccess: invalidate })

  const list = useMemo(() => (events.data ?? []).filter((e) => !subjectFilter || e.subjectId === subjectFilter), [events.data, subjectFilter])
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id)
  const colorOf = (e: CalendarEvent) => {
    const s = subjectOf(e.subjectId)
    return s ? color(s.color) : KIND_META[e.kind].color
  }

  const move = (dir: -1 | 1) =>
    setAnchor((a) => (view === 'week' ? addDaysTo(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)))
  const title =
    view === 'week'
      ? `${weekTitleFmt.format(days[0]!)} – ${weekTitleFmt.format(days[6]!)}`
      : view === 'month'
        ? monthFmt.format(anchor)
        : 'Línea de tiempo'

  const pickDay = (d: Date) => {
    setSelected(d)
    setDraftDate(toLocalDate(d))
  }
  const itemProps = { subjectOf, colorOf, onToggle: (e: CalendarEvent) => toggleDone.mutate(e), onRemove: (id: string) => remove.mutate(id) }

  return (
    <div className="h-full overflow-y-auto">
      <div className={cn('mx-auto grid gap-6 px-8 py-7 lg:grid-cols-[1fr_320px]', view === 'list' ? 'max-w-5xl' : 'max-w-7xl')}>
        <section className="min-w-0">
          {/* Barra: vista, alcance y navegación */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Vista" className="flex rounded-card bg-surface-2 p-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={view === v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium',
                    view === v.id ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  <v.icon size={13} /> {v.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Qué mostrar" className="flex rounded-card bg-surface-2 p-1">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    'h-7 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium',
                    scope === s.id ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {view === 'list' ? (
              <>
                {scope !== 'life' && (
                  <Button variant="ghost" size="sm" aria-pressed={showClasses} onClick={() => setShowClasses((v) => !v)} title="Clases (próximas 3 semanas)">
                    {showClasses ? 'Ocultar clases' : 'Ver clases'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)}>
                  {showPast ? 'Ocultar pasados' : 'Ver pasados'}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => move(-1)}>
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
                  Hoy
                </Button>
                <Button variant="ghost" size="icon" aria-label="Siguiente" onClick={() => move(1)}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
          <h2 className="mb-3 font-display text-lg font-semibold first-letter:uppercase">{title}</h2>

          {view === 'list' ? (
            <ListView events={list} loading={events.isLoading} {...itemProps} />
          ) : (
            <>
              {view === 'week' ? (
                <WeekView days={days} events={list} selected={selected} onPick={pickDay} colorOf={colorOf} />
              ) : (
                <MonthView days={days} month={anchor.getMonth()} events={list} selected={selected} onPick={pickDay} colorOf={colorOf} />
              )}
              {selected && <DayDetail day={selected} events={list.filter((e) => occursOn(e, selected))} {...itemProps} />}
            </>
          )}
        </section>

        <aside>
          <Card className="sticky top-0 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
              <CalendarPlus size={16} className="text-accent" /> Nuevo evento
            </h2>
            <EventForm defaultSubjectId={subjectFilter} date={draftDate} onCreated={invalidate} />
          </Card>
        </aside>
      </div>
    </div>
  )
}

/** Un evento ocupa el día si empieza ese día o lo atraviesa (eventos de varios días). */
function occursOn(e: CalendarEvent, day: Date): boolean {
  const start = startOfDay(e.startsAt).getTime()
  const end = startOfDay(e.endsAt ?? e.startsAt).getTime()
  const d = startOfDay(day).getTime()
  return d >= start && d <= end
}

interface ItemProps {
  subjectOf: (id: string | null) => Subject | undefined
  colorOf: (e: CalendarEvent) => string
  onToggle: (e: CalendarEvent) => void
  onRemove: (id: string) => void
}

// ─── Lista (línea de tiempo) ─────────────────────────────────────────────────
function ListView({ events, loading, ...item }: { events: CalendarEvent[]; loading: boolean } & ItemProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = monthFmt.format(e.startsAt)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [events])

  if (!groups.length && !loading)
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title="Nada por acá"
          description="Cargá parciales, entregas o cualquier cosa de tu semana: el planificador no te pone a estudiar encima."
        />
      </Card>
    )

  return (
    <div className="space-y-6">
      {groups.map(([month, items]) => (
        <div key={month}>
          <h3 className="mb-2 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">{month}</h3>
          <ol className="relative space-y-2 border-l-2 border-line pl-5">
            {items.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-4 -left-[27px] h-3 w-3 rounded-full ring-4 ring-canvas" style={{ background: item.colorOf(e) }} />
                <EventCard event={e} {...item} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

function EventCard({ event: e, subjectOf, colorOf, onToggle, onRemove, compact }: { event: CalendarEvent; compact?: boolean } & ItemProps) {
  const s = subjectOf(e.subjectId)
  const c = colorOf(e)
  const past = (e.endsAt ?? e.startsAt).getTime() < Date.now()
  const milestone = isMilestoneKind(e.kind)
  const Icon = KIND_META[e.kind].icon
  return (
    <Card className={cn('group flex items-center gap-4 px-4 py-3', (past || e.completedAt) && 'opacity-55')}>
      {!compact && (
        <div className="w-10 shrink-0 text-center leading-tight">
          <p className="text-[11px] text-fg-subtle uppercase">{weekdayFmt.format(e.startsAt)}</p>
          <p className="text-xl font-bold tabular-nums">{e.startsAt.getDate()}</p>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', e.completedAt && 'line-through')}>{e.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Icon size={12} style={{ color: c }} />
            {KIND_LABEL[e.kind]}
          </span>
          {s && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
              {s.name}
            </span>
          )}
          <span>
            {e.allDay ? 'Todo el día' : timeFmt.format(e.startsAt)}
            {!e.allDay && e.endsAt && ` – ${timeFmt.format(e.endsAt)}`}
          </span>
          {milestone && <span>· importancia {WEIGHT_LABEL[e.weight]?.toLowerCase()}</span>}
        </p>
      </div>
      {!compact && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            milestone && !past && e.startsAt.getTime() - Date.now() < 3 * 86_400_000 ? 'bg-danger/12 text-danger' : 'bg-surface-2 text-fg-muted'
          )}
        >
          {relativeDays(e.startsAt)}
        </span>
      )}
      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button size="icon" variant="ghost" title={e.completedAt ? 'Marcar pendiente' : 'Marcar como hecho'} aria-label={e.completedAt ? 'Marcar pendiente' : 'Marcar como hecho'} onClick={() => onToggle(e)}>
          <Check size={14} />
        </Button>
        {e.source === 'manual' && (
          <Button size="icon" variant="ghost" title="Borrar" aria-label={`Borrar ${e.title}`} onClick={() => onRemove(e.id)}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </Card>
  )
}

// ─── Semana ──────────────────────────────────────────────────────────────────
function WeekView({
  days,
  events,
  selected,
  onPick,
  colorOf
}: {
  days: Date[]
  events: CalendarEvent[]
  selected: Date | null
  onPick: (d: Date) => void
  colorOf: (e: CalendarEvent) => string
}) {
  const today = new Date()
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const items = events.filter((e) => occursOn(e, d))
        const isToday = sameDay(d, today)
        return (
          <button
            key={d.getTime()}
            type="button"
            onClick={() => onPick(d)}
            aria-label={`${longDayFmt.format(d)}: ${items.length} eventos`}
            className={cn(
              'flex min-h-[340px] min-w-0 flex-col gap-1 rounded-card border bg-surface p-1.5 text-left transition-colors hover:border-line-strong',
              selected && sameDay(selected, d) ? 'border-accent ring-1 ring-accent' : 'border-line',
              d < startOfDay(today) && 'opacity-60'
            )}
          >
            <div className="mb-1 flex items-baseline justify-between px-1">
              <span className="text-[11px] text-fg-subtle uppercase">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
              <span
                className={cn(
                  'grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums',
                  isToday && 'bg-accent text-accent-fg'
                )}
              >
                {d.getDate()}
              </span>
            </div>
            {items.map((e) => (
              <span
                key={e.id}
                title={`${KIND_LABEL[e.kind]}: ${e.title}`}
                className={cn('block rounded-[6px] border-l-[3px] bg-surface-2 px-1.5 py-1 text-[11px] leading-tight', e.completedAt && 'line-through opacity-60')}
                style={{ borderLeftColor: colorOf(e) }}
              >
                <span className="block text-fg-subtle tabular-nums">{e.allDay ? 'Todo el día' : timeFmt.format(e.startsAt)}</span>
                <span className="line-clamp-2 font-medium text-fg">{e.title}</span>
              </span>
            ))}
          </button>
        )
      })}
    </div>
  )
}

// ─── Mes ─────────────────────────────────────────────────────────────────────
const MAX_PER_CELL = 3

function MonthView({
  days,
  month,
  events,
  selected,
  onPick,
  colorOf
}: {
  days: Date[]
  month: number
  events: CalendarEvent[]
  selected: Date | null
  onPick: (d: Date) => void
  colorOf: (e: CalendarEvent) => string
}) {
  const today = new Date()
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="px-1 text-[11px] font-semibold text-fg-subtle uppercase">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const items = events.filter((e) => occursOn(e, d))
          const outside = d.getMonth() !== month
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${longDayFmt.format(d)}: ${items.length} eventos`}
              className={cn(
                'flex h-24 min-w-0 flex-col gap-0.5 rounded-[8px] border bg-surface p-1 text-left transition-colors hover:border-line-strong',
                selected && sameDay(selected, d) ? 'border-accent ring-1 ring-accent' : 'border-line',
                outside && 'opacity-45'
              )}
            >
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center self-start rounded-full px-1 text-[11px] font-semibold tabular-nums',
                  sameDay(d, today) && 'bg-accent text-accent-fg'
                )}
              >
                {d.getDate()}
              </span>
              {items.slice(0, MAX_PER_CELL).map((e) => (
                <span key={e.id} title={`${KIND_LABEL[e.kind]}: ${e.title}`} className={cn('flex min-w-0 items-center gap-1 text-[10.5px] leading-tight', e.completedAt && 'line-through opacity-60')}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(e) }} />
                  <span className="truncate">{e.title}</span>
                </span>
              ))}
              {items.length > MAX_PER_CELL && <span className="text-[10px] text-fg-subtle">+{items.length - MAX_PER_CELL} más</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayDetail({ day, events, ...item }: { day: Date; events: CalendarEvent[] } & ItemProps) {
  const label = longDayFmt.format(day)
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-semibold">
        {label.charAt(0).toUpperCase() + label.slice(1)}
        <span className="ml-2 text-xs font-normal text-fg-subtle">{events.length ? `${events.length} eventos` : 'Libre · cargá algo a la derecha'}</span>
      </h3>
      <div className="space-y-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} compact {...item} />
        ))}
      </div>
    </div>
  )
}

// ─── Alta ────────────────────────────────────────────────────────────────────
function EventForm({ defaultSubjectId, date: presetDate, onCreated }: { defaultSubjectId: string | null; date: string | null; onCreated: () => void }) {
  const { data: subjects = [] } = useSubjects()
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? '')
  const [kind, setKind] = useState<EventKind>('exam')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [endTime, setEndTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [weight, setWeight] = useState(4)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Al tocar un día en Semana/Mes, el formulario queda listo para ese día.
  useEffect(() => {
    if (presetDate) setDate(presetDate)
  }, [presetDate])

  const life = LIFE_EVENT_KINDS.includes(kind)
  const milestone = isMilestoneKind(kind)
  const subject = life ? undefined : subjects.find((s) => s.id === subjectId)
  const suggested = life ? KIND_META[kind].placeholder : `${KIND_LABEL[kind]}${subject ? ` · ${subject.code ?? subject.name}` : ''}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!date) return setError('Elegí una fecha')
    const startsAt = new Date(`${date}T${allDay ? '00:00' : time || '00:00'}`)
    const endsAt = !allDay && endTime ? new Date(`${date}T${endTime}`) : null
    if (endsAt && endsAt <= startsAt) return setError('La hora de fin tiene que ser después del inicio')
    setSaving(true)
    setError(null)
    try {
      await api.events.create({
        subjectId: life ? null : subjectId || null,
        kind,
        title: title.trim() || suggested,
        startsAt,
        endsAt,
        allDay,
        weight: milestone ? weight : 3
      })
      setTitle('')
      setEndTime('')
      onCreated()
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {KIND_GROUPS.map((g) => (
        <div key={g.label} role="group" aria-label={g.label}>
          <p className="mb-1 text-[11px] font-semibold text-fg-subtle">{g.label}</p>
          <div className="grid grid-cols-3 gap-1">
            {g.kinds.map((k) => {
              const Icon = KIND_META[k].icon
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-1 rounded-card border text-[11.5px] font-medium',
                    kind === k ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
                  )}
                >
                  <Icon size={12} style={{ color: KIND_META[k].color }} />
                  {KIND_LABEL[k]}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {!life && (
        <Field label="Materia">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 rounded-card border border-line bg-canvas px-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Sin materia</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} maxLength={160} />
      </Field>

      <Field label="Fecha">
        <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde">
          <Input type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Hasta (opcional)">
          <Input type="time" value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--accent)]" />
        Todo el día
      </label>
      {!milestone && !allDay && (
        <p className="text-[11px] text-fg-subtle">El planificador no te pone bloques de estudio en este horario.</p>
      )}

      {milestone && (
        <Field group label={`Importancia · ${WEIGHT_LABEL[weight]}`} hint="Un final pesa más que un TP: el planificador lo prioriza.">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === weight}
                onClick={() => setWeight(i)}
                className={cn(
                  'h-8 flex-1 rounded-card border text-xs font-medium',
                  i === weight ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-muted hover:bg-surface-2'
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </Field>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={saving}>
        Agregar
      </Button>
    </form>
  )
}
