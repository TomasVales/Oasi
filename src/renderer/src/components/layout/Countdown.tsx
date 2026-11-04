import { useMemo } from 'react'
import type { CalendarEvent } from '@shared/models'
import { cn } from '@/lib/cn'
import { formatCountdown } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { useUpcomingEvents } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'

import { KIND_LABEL, KIND_META } from '@/lib/eventKinds'

export { KIND_LABEL }

/** Próximo evento (clase, parcial o entrega) que todavía no empezó. */
export function useNextEvent(now: Date): CalendarEvent | null {
  const { data } = useUpcomingEvents()
  return useMemo(
    () =>
      (data ?? [])
        .filter((e) => !e.completedAt && e.startsAt.getTime() > now.getTime())
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null,
    // Se recalcula por minuto, no por segundo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, Math.floor(now.getTime() / 60_000)]
  )
}

/** Cuenta regresiva compacta para el encabezado del canal. */
export function CountdownPill() {
  const now = useNow(1000)
  const next = useNextEvent(now)
  const { data: subjects } = useSubjects()
  const color = useSubjectColor()
  if (!next) return null
  const Icon = KIND_META[next.kind].icon
  const subject = subjects?.find((s) => s.id === next.subjectId)
  const ms = next.startsAt.getTime() - now.getTime()
  const soon = ms < 86_400_000

  return (
    <div
      className={cn(
        'flex h-7 items-center gap-2 rounded-full border px-3 text-xs',
        soon ? 'border-danger/40 bg-danger/10' : 'border-line bg-surface'
      )}
      title={`${KIND_LABEL[next.kind]}: ${next.title}`}
    >
      <Icon size={13} className={soon ? 'text-danger' : 'text-fg-muted'} />
      {subject && <span className="h-2 w-2 rounded-full" style={{ background: color(subject.color) }} />}
      <span className="max-w-40 truncate text-fg-muted">{next.title}</span>
      <span className={cn('font-mono font-semibold tabular-nums', soon ? 'text-danger' : 'text-fg')}>{formatCountdown(ms)}</span>
    </div>
  )
}
