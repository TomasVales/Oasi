import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { useNavigate, useSearchParams } from 'react-router'
import { ClockPlus, Flame, Headphones, Maximize2, Palette, Pause, Play, Settings, SkipForward, Square } from 'lucide-react'
import { useState } from 'react'
import { SoundPlayer } from '@/features/sound/SoundPlayer'
import { useSoundscape } from '@/features/sound/SoundscapeProvider'
import { popover } from '@/lib/motion'
import { toLocalDate } from '@shared/domain'
import { addDays, parseLocalDate } from '@shared/dates'
import { heatLevel } from '@shared/heatmap'
import { phaseElapsed, phaseRemaining } from '@shared/timer'
import { studyModeLabel } from '@shared/planner'
import { THEME_META } from '@shared/theme'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration } from '@/lib/format'
import { queryKeys } from '@/lib/queryClient'
import { useStreak } from '@/hooks/useAppData'
import { useSession } from '@/features/session/SessionProvider'
import { LogStudyDialog } from '@/features/session/LogStudyDialog'
import { SessionSubjectPicker } from '@/features/session/SessionSubjectPicker'
import { openFocusMode, TIMER_SHORTCUTS } from '@/features/focus/FocusOverlay'
import { MOD_KEY_LABEL } from '@/navigation'
import { useTheme } from '@/theme/ThemeProvider'

const HEAT = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4']
const WEEKDAY = new Intl.DateTimeFormat('es', { weekday: 'narrow', timeZone: 'UTC' })
const LONGDAY = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'no-drag flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors',
        danger ? 'text-danger hover:bg-danger/15' : 'text-fg-muted hover:bg-hover hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}

/** Anillo de progreso de la fase actual del cronómetro, con el tiempo restante adentro. */
function ProgressRing({ progress, tone, children }: { progress: number; tone: string; children: React.ReactNode }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" className="stroke-surface-2" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', tone)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Tarjeta de la sesión en curso (aparece sobre la de racha). */
function SessionCard() {
  const { session, now, pause, resume, skip, stop } = useSession()
  return (
    <AnimatePresence initial={false}>
      {session && (
        <motion.div
          key="session"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={spring.sheet}
          className="overflow-hidden"
        >
          <SessionCardBody session={session} now={now} pause={pause} resume={resume} skip={skip} stop={stop} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SessionCardBody({
  session,
  now,
  pause,
  resume,
  skip,
  stop
}: Pick<ReturnType<typeof useSession>, 'now' | 'pause' | 'resume' | 'skip' | 'stop'> & {
  session: NonNullable<ReturnType<typeof useSession>['session']>
}) {

  const t = session.timer
  const running = t.runningSince !== null
  const status = t.phase === 'done' ? 'Bloque completo' : t.phase === 'break' ? 'Descanso' : running ? 'En foco' : 'En pausa'
  const tone = t.phase === 'done' ? 'text-accent' : t.phase === 'break' ? 'text-warning' : running ? 'text-success' : 'text-fg-subtle'
  const stroke = t.phase === 'break' ? 'stroke-warning' : t.phase === 'done' ? 'stroke-accent' : 'stroke-success'
  const progress = t.phase === 'done' ? 1 : t.phaseDurationMs ? Math.min(1, phaseElapsed(t, now) / t.phaseDurationMs) : 0
  const remaining = formatClock(t.phase === 'done' ? 0 : phaseRemaining(t, now))

  return (
    <div className="mx-2 mb-2 rounded-[12px] border border-line bg-surface p-2.5 shadow-card">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openFocusMode}
          title={`Vista de foco (${TIMER_SHORTCUTS.focus})`}
          aria-label={`Abrir vista de foco. Quedan ${remaining}`}
          className="no-drag shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <ProgressRing progress={progress} tone={stroke}>
            <span role="timer" className="font-mono text-[12px] font-semibold tabular-nums">
              {remaining}
            </span>
          </ProgressRing>
        </button>
        <div className="min-w-0 flex-1">
          {/* Solo el estado se anuncia (no cada segundo del reloj). */}
          <p aria-live="polite" className={cn('text-[12px] font-semibold', tone, running && 'live-pulse')}>{status}</p>
          <SessionSubjectPicker className="text-[12px] text-fg" />
          {session.mode && <p className="truncate text-[11px] text-fg-subtle">{studyModeLabel(session.mode)}</p>}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 border-t border-line pt-1.5">
        {t.phase !== 'done' &&
          (running ? (
            <IconButton label={`Pausar (${TIMER_SHORTCUTS.toggle})`} onClick={pause}>
              <Pause size={15} />
            </IconButton>
          ) : (
            <IconButton label={`Reanudar (${TIMER_SHORTCUTS.toggle})`} onClick={resume}>
              <Play size={15} />
            </IconButton>
          ))}
        {t.phase !== 'done' && (
          <IconButton label={t.phase === 'break' ? 'Saltar descanso' : 'Pasar al descanso'} onClick={skip}>
            <SkipForward size={15} />
          </IconButton>
        )}
        <IconButton label={`Vista de foco (${TIMER_SHORTCUTS.focus})`} onClick={openFocusMode}>
          <Maximize2 size={14} />
        </IconButton>
        <span className="flex-1" />
        <IconButton label="Terminar sesión" onClick={() => void stop()} danger>
          <Square size={13} fill="currentColor" />
        </IconButton>
      </div>
      <div className="mt-1.5 border-t border-line pt-2">
        <SoundPlayer compact />
      </div>
    </div>
  )
}

/** Racha + últimos 7 días en mini-heatmap. */
export function UserPanel() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { session, start } = useSession()
  const { theme, cycleTheme } = useTheme()
  const { data: streak } = useStreak()
  const sound = useSoundscape()
  const [soundOpen, setSoundOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const today = toLocalDate()
  const from = addDays(today, -6)
  const week = useQuery({ queryKey: queryKeys.statsRange(from, today, null), queryFn: () => api.stats.range(from, today) })
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i)
    return { date, seconds: week.data?.daily.find((d) => d.localDate === date)?.seconds ?? 0 }
  })

  const current = streak?.current ?? 0
  const hint = session
    ? 'Estudiando ahora'
    : streak?.studiedToday
      ? 'Hoy ya suma ✓'
      : streak && streak.minutesLeftToday > 0
        ? `Faltan ${streak.minutesLeftToday} min hoy`
        : 'Empezá hoy'

  return (
    <div className="border-t border-line bg-panel pt-2">
      <SessionCard />
      <div className="flex items-center gap-2.5 px-3 pb-2">
        <div className="flex items-baseline gap-1" title={`Racha actual: ${current} · mejor: ${streak?.longest ?? 0}`}>
          <Flame
            size={18}
            className={cn('self-center', current ? 'text-warning arcade:text-accent-2' : 'text-fg-subtle')}
            fill={current ? 'currentColor' : 'none'}
          />
          <span className="text-lg leading-none font-bold tabular-nums">{current}</span>
          <span className="text-[11px] text-fg-muted">{current === 1 ? 'día' : 'días'}</span>
        </div>
        <span className="flex-1" />
        {!session && (
          <IconButton label={`Empezar sesión libre (${TIMER_SHORTCUTS.toggle})`} onClick={() => void start({ subjectId: params.get('subject'), plannedMinutes: null })}>
            <Play size={15} />
          </IconButton>
        )}
        <IconButton label="Registrar estudio hecho sin la app" onClick={() => setLogOpen(true)}>
          <ClockPlus size={15} />
        </IconButton>
        {sound.settings.enabled && !session && (
          <div className="relative">
            <IconButton label="Sonidos ambiente" onClick={() => setSoundOpen((v) => !v)}>
              <Headphones size={15} className={cn(sound.playing && 'text-success')} />
            </IconButton>
            <AnimatePresence>
              {soundOpen && (
                <motion.div
                  variants={popover}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{ transformOrigin: 'bottom left' }}
                  className="absolute bottom-9 left-0 z-50 w-56 rounded-[12px] border border-line bg-surface p-2 shadow-xl"
                  onMouseLeave={() => setSoundOpen(false)}
                >
                  <p className="mb-1.5 px-1 text-[11px] font-semibold text-fg-muted">Sonidos ambiente</p>
                  <SoundPlayer />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <IconButton label={`Tema: ${THEME_META[theme].label} (${MOD_KEY_LABEL}⇧T)`} onClick={cycleTheme}>
          <Palette size={15} />
        </IconButton>
        <IconButton label="Ajustes" onClick={() => navigate('/ajustes')}>
          <Settings size={15} />
        </IconButton>
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-7 gap-1" aria-label="Últimos 7 días">
          {days.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-0.5" title={`${LONGDAY.format(new Date(parseLocalDate(d.date)))}: ${d.seconds >= 60 ? formatDuration(d.seconds) : 'sin estudio'}`}>
              <span
                className={cn(
                  'h-3.5 w-full rounded-[4px]',
                  HEAT[heatLevel(d.seconds)],
                  d.date === today && 'ring-1 ring-fg-muted ring-offset-1 ring-offset-panel'
                )}
              />
              <span className={cn('text-[9px] uppercase', d.date === today ? 'font-semibold text-fg' : 'text-fg-subtle')}>
                {WEEKDAY.format(new Date(parseLocalDate(d.date)))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 truncate text-[11px] text-fg-muted">{hint}</p>
      </div>
      <AnimatePresence>
        {logOpen && <LogStudyDialog key="log" defaultSubjectId={params.get('subject')} onClose={() => setLogOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}
