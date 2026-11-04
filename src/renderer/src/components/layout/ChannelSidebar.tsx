import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router'
import { BookOpenText, CalendarDays, ChartColumn, ChevronDown, Layers, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { HOME_NAV, MOD_KEY_LABEL } from '@/navigation'
import { UserPanel } from './UserPanel'
import { APP_NAME, APP_TAGLINE } from '@shared/brand'
import { FileTree } from '@/features/files/FileTree'

function Category({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="pt-5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="no-drag group flex w-full items-center gap-1.5 px-2 text-[12px] font-semibold text-fg-muted hover:text-fg"
      >
        <span className="flex-1 truncate text-left">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-medium tabular-nums text-fg-subtle">{count}</span>
        )}
        <ChevronDown size={13} className={cn('text-fg-subtle transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="mt-1 space-y-px">{children}</div>}
    </div>
  )
}

function Channel({
  to,
  icon: Icon,
  label,
  active,
  hint,
  muted
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  hint?: string
  muted?: boolean
}) {
  return (
    <Link
      to={to}
      title={hint}
      className={cn(
        'no-drag group relative flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[13.5px] transition-colors',
        active
          ? 'bg-selected font-medium text-fg arcade:text-accent before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
          : cn('hover:bg-hover hover:text-fg', muted ? 'text-fg-subtle' : 'text-fg-muted')
      )}
    >
      <Icon size={17} strokeWidth={1.9} className={cn('shrink-0', active ? 'text-fg-muted arcade:text-accent' : 'text-fg-subtle')} />
      <span className="truncate">{label}</span>
    </Link>
  )
}

function HomeChannels() {
  return (
    <Category title="Secciones">
      {HOME_NAV.map((n) => (
        <NavLink
          key={n.path}
          to={n.path}
          end={n.path === '/'}
          title={`${n.topic} · ${MOD_KEY_LABEL}${n.shortcut}`}
          className={({ isActive }) =>
            cn(
              'no-drag group relative flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[13.5px] transition-colors',
              isActive
                ? 'bg-selected font-medium text-fg arcade:text-accent before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
                : 'text-fg-muted hover:bg-hover hover:text-fg'
            )
          }
        >
          <n.icon size={17} strokeWidth={1.9} className="shrink-0 text-fg-subtle" />
          <span className="flex-1 truncate">{n.label}</span>
          <kbd className="font-mono text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100">
            {MOD_KEY_LABEL}
            {n.shortcut}
          </kbd>
        </NavLink>
      ))}
    </Category>
  )
}

function SubjectChannels({ subjectId }: { subjectId: string }) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const q = `subject=${subjectId}`
  const docParam = params.get('doc')
  const noteParam = params.get('note')

  return (
    <>
      <Category title="Materia">
        <Channel to={`/estudio?${q}`} icon={BookOpenText} label="Estudio" active={pathname === '/estudio' && !docParam && !noteParam} />
        <Channel to={`/calendario?${q}`} icon={CalendarDays} label="Fechas" active={pathname === '/calendario'} />
        <Channel to={`/estadisticas?${q}`} icon={ChartColumn} label="Progreso" active={pathname === '/estadisticas'} />
        <Channel to={`/repaso?${q}`} icon={Layers} label="Repaso" active={pathname === '/repaso'} />
      </Category>
      <FileTree subjectId={subjectId} />
    </>
  )
}

export function ChannelSidebar() {
  const [params] = useSearchParams()
  const subjectId = params.get('subject')
  const { data: subjects } = useSubjects()
  const subject = subjects?.find((s) => s.id === subjectId)
  const color = useSubjectColor()

  return (
    <aside className="relative z-[1] flex h-full w-60 shrink-0 flex-col bg-sidebar">
      <header className="shell-header drag-region flex h-12 shrink-0 items-center gap-2 px-4">
        {subject ? (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(subject.color) }} />
            <h2 className="truncate font-display text-[15px] font-semibold">{subject.name}</h2>
          </>
        ) : (
          <h2 className="flex items-center gap-2 truncate font-display text-[15px] font-semibold arcade:text-glow">
            {APP_NAME}
            <span className="text-[11px] font-normal text-fg-subtle">{APP_TAGLINE}</span>
          </h2>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {subject ? <SubjectChannels subjectId={subject.id} /> : <HomeChannels />}
      </div>
      <UserPanel />
    </aside>
  )
}
