import { useMemo } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { PixelIcon } from '@/components/ui/PixelIcon'
import { useSettings } from '@/hooks/useAppData'
import type { Subject } from '@shared/models'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import { useUpcomingEvents } from '@/hooks/useAppData'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { useSubjects } from '@/hooks/useSubjects'

/** Ventana del anillo de urgencia: a 14 días o más está vacío; el día del hito, lleno. */
const URGENCY_WINDOW_DAYS = 14

/** Días al próximo parcial/entrega pendiente de cada materia. */
function useNextMilestoneDays(): Map<string, number> {
  const { data: events } = useUpcomingEvents()
  return useMemo(() => {
    const map = new Map<string, number>()
    const now = Date.now()
    for (const e of events ?? []) {
      if (!e.subjectId || e.completedAt || (e.kind !== 'exam' && e.kind !== 'assignment')) continue
      const days = (e.startsAt.getTime() - now) / 86_400_000
      if (days < 0) continue
      map.set(e.subjectId, Math.min(map.get(e.subjectId) ?? Infinity, days))
    }
    return map
  }, [events])
}

function UrgencyRing({ days, color }: { days: number; color: string }) {
  const progress = Math.max(0, Math.min(1, 1 - days / URGENCY_WINDOW_DAYS))
  if (progress === 0) return null
  return (
    <svg className="dock-ring" viewBox="0 0 52 52" aria-hidden>
      <rect className="track" x="1.5" y="1.5" width="49" height="49" rx="16" />
      <rect
        className="value"
        x="1.5"
        y="1.5"
        width="49"
        height="49"
        rx="16"
        pathLength={100}
        strokeDasharray={`${progress * 100} 100`}
        style={{ stroke: color, color }}
      />
    </svg>
  )
}

function DockItem({
  to,
  name,
  label,
  labelClass,
  active,
  children,
  tileClass,
  tileStyle,
  ring
}: {
  to: string
  name: string
  label: string
  labelClass?: string
  active: boolean
  children: React.ReactNode
  tileClass?: string
  tileStyle?: React.CSSProperties
  ring?: React.ReactNode
}) {
  return (
    <div className="dock-item no-drag relative flex w-full justify-center">
      <Link to={to} aria-label={name} aria-current={active ? 'page' : undefined} className="flex flex-col items-center gap-1 outline-none">
        <span className={cn('dock-tile', tileClass)} style={tileStyle}>
          {ring}
          {children}
        </span>
        <span className={cn('dock-label', labelClass ?? (active ? 'font-semibold text-fg' : 'text-fg-subtle'))}>{label}</span>
      </Link>
      <span className="dock-tip" role="tooltip">
        {name}
      </span>
    </div>
  )
}

/** Días de CALENDARIO hasta el hito (una entrega pasado mañana a las 23 h es "en 2 días", no "mañana"). */
function calendarDays(daysFloat: number): number {
  const now = new Date()
  const target = new Date(now.getTime() + daysFloat * 86_400_000)
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(target) - start(now)) / 86_400_000)
}

function dueLabel(days: number): string {
  const d = calendarDays(days)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'mañana'
  return `${d} días`
}

export function ServerRail() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const activeSubject = params.get('subject')
  const { data: subjects = [] } = useSubjects()
  const due = useNextMilestoneDays()
  const color = useSubjectColor()
  const { data: settings } = useSettings()
  const homeActive = !activeSubject && pathname === '/'

  return (
    <nav aria-label="Materias" className="drag-region relative z-[1] flex h-full w-[76px] shrink-0 flex-col items-center gap-3 border-r border-line bg-rail pt-3 pb-3 mac:pt-11">
      <DockItem
        to="/"
        name="Inicio"
        label="Inicio"
        active={homeActive}
        tileClass={cn('overflow-hidden', homeActive ? 'shadow-card ring-2 ring-accent ring-offset-2 ring-offset-rail arcade:shadow-glow' : 'opacity-90 hover:opacity-100')}
      >
        <PixelIcon variant={settings?.appIcon ?? 'clasico'} size={44} />
      </DockItem>

      <div className="no-drag flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto px-1 pt-1 [scrollbar-width:none]">
        {subjects.map((s: Subject) => {
          const c = color(s.color)
          const active = activeSubject === s.id
          const days = due.get(s.id)
          const cal = days !== undefined ? calendarDays(days) : undefined
          const soon = cal !== undefined && cal <= 7
          return (
            <DockItem
              key={s.id}
              to={`/estudio?subject=${s.id}`}
              name={days !== undefined ? `${s.name} · próximo hito ${dueLabel(days)}` : s.name}
              label={soon && days !== undefined ? dueLabel(days) : (s.code ?? initials(s.name))}
              labelClass={soon ? (cal! <= 2 ? 'font-semibold text-danger' : 'font-medium text-warning') : undefined}
              active={active}
              ring={days !== undefined ? <UrgencyRing days={days} color={c} /> : null}
              // Sin anillo, una línea inferior con el color de la materia la identifica.
              tileStyle={active ? { background: c, color: '#fff' } : days === undefined ? { boxShadow: `inset 0 -3px 0 ${c}` } : undefined}
              tileClass={cn('font-display text-[13px] font-bold tracking-tight', !active && 'bg-surface-2 text-fg hover:bg-hover')}
            >
              {initials(s.name, s.code)}
            </DockItem>
          )
        })}

        <DockItem
          to="/materias?nueva=1"
          name="Agregar materia"
          label="Nueva"
          active={false}
          tileClass="border-2 border-dashed border-line-strong text-fg-subtle hover:border-accent hover:text-accent"
        >
          <Plus size={20} />
        </DockItem>
      </div>
    </nav>
  )
}
