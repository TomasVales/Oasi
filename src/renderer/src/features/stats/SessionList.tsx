import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { StudySession } from '@shared/models'
import { parseLocalDate } from '@shared/dates'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Card, CardHeader } from '@/components/ui/Card'
import { useToast } from '@/features/toast/ToastProvider'
import { focusLevel } from '@/features/session/SessionReflection'

const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

const SLOTS = [
  { label: 'a la mañana', from: 5, to: 12 },
  { label: 'a la tarde', from: 12, to: 19 },
  { label: 'a la noche', from: 19, to: 24 },
  { label: 'de madrugada', from: 0, to: 5 }
]

/** Con 4+ sesiones calificadas (y 2+ en al menos dos franjas horarias), dice en cuál rendís mejor. */
function bestSlot(sessions: StudySession[]): string | null {
  const scored = sessions.filter((s) => s.focusScore !== null)
  if (scored.length < 4) return null
  const bySlot = SLOTS.map((slot) => {
    const xs = scored.filter((s) => {
      const h = s.startedAt.getHours()
      return h >= slot.from && h < slot.to
    })
    return { slot, n: xs.length, avg: xs.reduce((a, s) => a + s.focusScore!, 0) / (xs.length || 1) }
  }).filter((x) => x.n >= 2)
  if (bySlot.length < 2) return null
  const best = bySlot.reduce((a, b) => (b.avg > a.avg ? b : a))
  return `Rendís mejor ${best.slot.label} (${Math.round(best.avg * 100)} % de foco promedio en ${best.n} sesiones).`
}

/** Sesiones del período: corregir duración/materia de las que quedaron mal, o borrarlas. */
export function SessionList({ from, to, subjectId }: { from: string; to: string; subjectId: string | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: subjects = [] } = useSubjects(true)
  const color = useSubjectColor()
  const [editing, setEditing] = useState<string | null>(null)
  const [trashed, setTrashed] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  const list = useQuery({ queryKey: [...queryKeys.stats, 'sessions', from, to], queryFn: () => api.sessions.list(from, to) })

  const sessions = useMemo(
    () => (list.data ?? []).filter((s) => !trashed.includes(s.id) && (!subjectId || s.subjectId === subjectId)),
    [list.data, trashed, subjectId]
  )
  const visible = showAll ? sessions : sessions.slice(0, 15)
  const insight = useMemo(() => bestSlot(list.data ?? []), [list.data])
  const days = useMemo(() => {
    const groups: { date: string; items: StudySession[] }[] = []
    for (const s of visible) {
      const last = groups[groups.length - 1]
      if (last?.date === s.localDate) last.items.push(s)
      else groups.push({ date: s.localDate, items: [s] })
    }
    return groups
  }, [visible])

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.stats })

  const remove = (s: StudySession) => {
    setTrashed((t) => [...t, s.id])
    const restore = () => setTrashed((t) => t.filter((x) => x !== s.id))
    toast.undoable({
      text: `Sesión de ${formatDuration(s.activeSeconds)} eliminada`,
      commit: async () => {
        await api.sessions.remove(s.id)
        await refresh()
        restore()
      },
      undo: restore,
      onError: (err) => toast.show({ kind: 'error', text: `No se pudo eliminar: ${ipcErrorMessage(err)}` })
    })
  }

  if (!sessions.length) return null

  return (
    <Card>
      <CardHeader title="Sesiones" />
      {insight && <p className="mx-4 mb-3 rounded-card bg-accent-soft px-3 py-2 text-xs text-fg">💡 {insight}</p>}
      <div className="px-2 pb-3">
        {days.map((d) => {
          const label = dayFmt.format(new Date(parseLocalDate(d.date)))
          return (
            <div key={d.date} className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold text-fg-subtle">{label.charAt(0).toUpperCase() + label.slice(1)}</p>
              <ul className="divide-y divide-line">
                {d.items.map((s) =>
                  editing === s.id ? (
                    <EditRow
                      key={s.id}
                      session={s}
                      subjects={subjects}
                      onCancel={() => setEditing(null)}
                      onSave={async (patch) => {
                        try {
                          await api.sessions.update(s.id, patch)
                          await refresh()
                          setEditing(null)
                        } catch (err) {
                          toast.show({ kind: 'error', text: `No se pudo guardar: ${ipcErrorMessage(err)}` })
                        }
                      }}
                    />
                  ) : (
                    <Row
                      key={s.id}
                      session={s}
                      subject={subjects.find((x) => x.id === s.subjectId)}
                      color={color}
                      onEdit={() => setEditing(s.id)}
                      onDelete={() => remove(s)}
                    />
                  )
                )}
              </ul>
            </div>
          )
        })}
        {sessions.length > visible.length && (
          <button type="button" onClick={() => setShowAll(true)} className="mx-2 text-xs font-medium text-accent hover:underline">
            Ver las {sessions.length} sesiones
          </button>
        )}
      </div>
    </Card>
  )
}

type Subject = ReturnType<typeof useSubjects>['data'] extends (infer T)[] | undefined ? T : never

function Row({
  session: s,
  subject,
  color,
  onEdit,
  onDelete
}: {
  session: StudySession
  subject: Subject | undefined
  color: ReturnType<typeof useSubjectColor>
  onEdit: () => void
  onDelete: () => void
}) {
  const level = focusLevel(s.focusScore)
  return (
    <li className="group flex h-10 items-center gap-3 rounded-[8px] px-2 text-sm hover:bg-hover">
      <span className="w-24 shrink-0 text-xs text-fg-muted tabular-nums">
        {timeFmt.format(s.startedAt)}–{s.endedAt ? timeFmt.format(s.endedAt) : '…'}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: subject ? color(subject.color) : 'var(--fg-subtle)' }} />
        <span className="truncate">{subject?.name ?? 'Sin materia'}</span>
        {s.source === 'manual' && (
          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[10px] text-fg-subtle">cargada a mano</span>
        )}
      </span>
      {level && (
        <span title={`Foco: ${level.label}`} aria-label={`Foco: ${level.label}`}>
          {level.emoji}
        </span>
      )}
      {s.pagesFrom !== null && s.pagesTo !== null && (
        <span className="shrink-0 text-xs text-fg-subtle tabular-nums">
          págs. {s.pagesFrom}–{s.pagesTo}
        </span>
      )}
      <span className="w-20 shrink-0 text-right font-medium tabular-nums">{formatDuration(s.activeSeconds)}</span>
      <span className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <IconBtn label="Editar sesión" onClick={onEdit}>
          <Pencil size={13} />
        </IconBtn>
        <IconBtn label="Eliminar sesión" onClick={onDelete} danger>
          <Trash2 size={13} />
        </IconBtn>
      </span>
    </li>
  )
}

function EditRow({
  session: s,
  subjects,
  onSave,
  onCancel
}: {
  session: StudySession
  subjects: Subject[]
  onSave: (patch: { subjectId: string | null; activeSeconds: number }) => void
  onCancel: () => void
}) {
  const [subjectId, setSubjectId] = useState(s.subjectId ?? '')
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round(s.activeSeconds / 60))))
  const m = Number(minutes)
  const valid = Number.isInteger(m) && m >= 1 && m <= 720
  const submit = () => valid && onSave({ subjectId: subjectId || null, activeSeconds: m * 60 })
  return (
    <li
      className="flex h-12 items-center gap-2 rounded-[8px] bg-surface-2 px-2"
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') onCancel()
      }}
    >
      <select
        aria-label="Materia"
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-card border border-line bg-canvas px-2 text-sm focus:border-accent focus:outline-none"
      >
        <option value="">Sin materia</option>
        {subjects.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        autoFocus
        aria-label="Minutos de foco"
        min={1}
        max={720}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        className={cn(
          'h-8 w-20 rounded-card border bg-canvas px-2 text-right text-sm tabular-nums focus:outline-none',
          valid ? 'border-line focus:border-accent' : 'border-danger'
        )}
      />
      <span className="text-xs text-fg-muted">min</span>
      <IconBtn label="Guardar" onClick={submit}>
        <Check size={14} />
      </IconBtn>
      <IconBtn label="Cancelar" onClick={onCancel}>
        <X size={14} />
      </IconBtn>
    </li>
  )
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-[7px]',
        danger ? 'text-danger hover:bg-danger/15' : 'text-fg-muted hover:bg-selected hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}
