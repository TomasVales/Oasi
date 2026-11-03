import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { CalendarPlus, Check, Trash2 } from 'lucide-react'
import type { EventKind } from '@shared/domain'
import type { CalendarEvent } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { relativeDays, timeFmt } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Field'
import { KIND_LABEL } from '@/components/layout/Countdown'

const monthFmt = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat('es', { weekday: 'short' })
const MANUAL_KINDS: EventKind[] = ['exam', 'assignment', 'other']
const WEIGHT_LABEL = ['', 'Menor', 'Baja', 'Normal', 'Alta', 'Crítica']

export function CalendarPage() {
  const [params] = useSearchParams()
  const subjectFilter = params.get('subject')
  const [showPast, setShowPast] = useState(false)
  const [showClasses, setShowClasses] = useState(false)
  const qc = useQueryClient()
  const { data: subjects = [] } = useSubjects()
  const color = useSubjectColor()

  const events = useQuery({
    queryKey: [...queryKeys.events, 'calendar', showPast, showClasses],
    queryFn: () => {
      const now = new Date()
      return api.events.listRange({
        from: showPast ? new Date(now.getTime() - 180 * 86_400_000) : new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        to: new Date(now.getTime() + (showClasses ? 21 : 365) * 86_400_000),
        kinds: showClasses ? [...MANUAL_KINDS, 'class'] : MANUAL_KINDS
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

  const groups = useMemo(() => {
    const list = (events.data ?? []).filter((e) => !subjectFilter || e.subjectId === subjectFilter)
    const map = new Map<string, CalendarEvent[]>()
    for (const e of list) {
      const key = monthFmt.format(e.startsAt)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [events.data, subjectFilter])

  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-8 px-8 py-7 lg:grid-cols-[1fr_320px]">
        {/* Línea de tiempo */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Línea de tiempo</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" aria-pressed={showClasses} onClick={() => setShowClasses((v) => !v)} title="Clases importadas de Google Calendar (próximas 3 semanas)">
                {showClasses ? 'Ocultar clases' : 'Ver clases'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Ocultar pasados' : 'Ver pasados'}
              </Button>
            </div>
          </div>

          {!groups.length && !events.isLoading ? (
            <Card>
              <EmptyState
                icon={CalendarPlus}
                title="Sin hitos cargados"
                description="Cargá tus parciales y entregas: alimentan la cuenta regresiva y el planificador."
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map(([month, items]) => (
                <div key={month}>
                  <h3 className="mb-2 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">{month}</h3>
                  <ol className="relative space-y-2 border-l-2 border-line pl-5">
                    {items.map((e) => {
                      const s = subjectOf(e.subjectId)
                      const c = s ? color(s.color) : 'var(--fg-subtle)'
                      const past = e.startsAt.getTime() < Date.now()
                      return (
                        <li key={e.id} className={cn('group relative', (past || e.completedAt) && 'opacity-55')}>
                          <span
                            className="absolute top-4 -left-[27px] h-3 w-3 rounded-full ring-4 ring-canvas"
                            style={{ background: c }}
                          />
                          <Card className="flex items-center gap-4 px-4 py-3">
                            <div className="w-10 shrink-0 text-center leading-tight">
                              <p className="text-[11px] text-fg-subtle uppercase">{weekdayFmt.format(e.startsAt)}</p>
                              <p className="text-xl font-bold tabular-nums">{e.startsAt.getDate()}</p>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={cn('truncate font-medium', e.completedAt && 'line-through')}>{e.title}</p>
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                                <span className="font-semibold text-fg">{KIND_LABEL[e.kind]}</span>
                                {s && (
                                  <span className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                                    {s.name}
                                  </span>
                                )}
                                <span>{e.allDay ? 'Todo el día' : timeFmt.format(e.startsAt)}</span>
                                <span>· importancia {WEIGHT_LABEL[e.weight]?.toLowerCase()}</span>
                              </p>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                !past && e.startsAt.getTime() - Date.now() < 3 * 86_400_000
                                  ? 'bg-danger/12 text-danger'
                                  : 'bg-surface-2 text-fg-muted'
                              )}
                            >
                              {relativeDays(e.startsAt)}
                            </span>
                            <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                              <Button
                                size="icon"
                                variant="ghost"
                                title={e.completedAt ? 'Marcar pendiente' : 'Marcar como hecho'}
                                onClick={() => toggleDone.mutate(e)}
                              >
                                <Check size={14} />
                              </Button>
                              {e.source === 'manual' && (
                                <Button size="icon" variant="ghost" title="Borrar" onClick={() => remove.mutate(e.id)}>
                                  <Trash2 size={14} />
                                </Button>
                              )}
                            </div>
                          </Card>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alta manual */}
        <aside>
          <Card className="sticky top-0 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
              <CalendarPlus size={16} className="text-accent" /> Nuevo hito
            </h2>
            <MilestoneForm defaultSubjectId={subjectFilter} onCreated={invalidate} />
          </Card>
        </aside>
      </div>
    </div>
  )
}

function MilestoneForm({ defaultSubjectId, onCreated }: { defaultSubjectId: string | null; onCreated: () => void }) {
  const { data: subjects = [] } = useSubjects()
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? '')
  const [kind, setKind] = useState<EventKind>('exam')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [allDay, setAllDay] = useState(false)
  const [weight, setWeight] = useState(4)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const subject = subjects.find((s) => s.id === subjectId)
  const suggested = `${KIND_LABEL[kind]}${subject ? ` · ${subject.code ?? subject.name}` : ''}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!date) return setError('Elegí una fecha')
    setSaving(true)
    setError(null)
    try {
      await api.events.create({
        subjectId: subjectId || null,
        kind,
        title: title.trim() || suggested,
        startsAt: new Date(`${date}T${allDay ? '00:00' : time || '00:00'}`),
        allDay,
        weight
      })
      setTitle('')
      setDate('')
      onCreated()
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-card bg-surface-2 p-1">
        {MANUAL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'h-7 rounded-[calc(var(--radius)-2px)] text-xs font-medium',
              kind === k ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

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

      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} maxLength={160} />
      </Field>

      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label="Fecha">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--accent)]" />
        Todo el día
      </label>

      <Field group label={`Importancia · ${WEIGHT_LABEL[weight]}`} hint="Un final pesa más que un TP: el planificador lo prioriza.">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
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

      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={saving}>
        Agregar
      </Button>
    </form>
  )
}
