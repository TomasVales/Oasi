import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useSearchParams } from 'react-router'
import { Minimize2, Pause, Play, SkipForward, Square } from 'lucide-react'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { activeSeconds, phaseElapsed, phaseRemaining } from '@shared/timer'
import { studyModeLabel } from '@shared/planner'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration } from '@/lib/format'
import { EASE_OUT_MAC } from '@/lib/motion'
import { useSettings } from '@/hooks/useAppData'
import { useBackgroundUrl } from '@/features/background/useBackgroundUrl'
import { useSession } from '@/features/session/SessionProvider'
import { SessionSubjectPicker } from '@/features/session/SessionSubjectPicker'
import { MOD_KEY_LABEL } from '@/navigation'

const OPEN_EVENT = 'studentos:focus-mode'
/** Abre la vista de foco a mano (botón de la tarjeta de sesión o ⌘⇧F). */
export const openFocusMode = () => window.dispatchEvent(new Event(OPEN_EVENT))

const isMac = window.studentOS.app.platform === 'darwin'
/** Movimiento mínimo del mouse para salir de la vista automática (evita temblores del sensor). */
const MOVE_THRESHOLD_PX = 12
/** Tras abrirse, unos ms en los que el mismo gesto no la cierra. */
const GRACE_MS = 500

export const TIMER_SHORTCUTS = {
  toggle: `${MOD_KEY_LABEL}⇧P`,
  focus: `${MOD_KEY_LABEL}⇧F`
}

/** Hay un menú, diálogo o popover abierto: no tapar lo que el usuario está usando. */
function somethingOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [data-focus-block]')
}

type Mode = 'auto' | 'manual'

/**
 * Vista de foco: durante una sesión, tapa la app con solo el cronómetro grande.
 * - Automática: se abre tras N segundos sin tocar la app (sin menús abiertos) y se cierra
 *   con cualquier movimiento, scroll o tecla, para volver a lo que estabas haciendo.
 * - Manual (botón o ⌘⇧F): queda fija hasta Esc o "Salir".
 * Teclado: Espacio pausa/reanuda, S salta la fase, +/− suman o restan 5 min, Esc sale.
 * Globales: ⌘⇧P y ⌘⇧F. No se abre sola con un PDF abierto (leyendo no se mueve el mouse).
 */
export function FocusOverlay() {
  const { session, now, pause, resume, skip, adjust, stop, start } = useSession()
  const { data: settings } = useSettings()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const readingPdf = pathname === '/estudio' && !!params.get('doc')
  const [mode, setMode] = useState<Mode | null>(null)
  const openedAt = useRef(0)
  const lastActivity = useRef(Date.now())
  const focusCfg = settings?.focusMode ?? DEFAULT_SETTINGS.focusMode

  const running = !!session && session.timer.runningSince !== null
  const sessionRef = useRef(session)
  sessionRef.current = session

  const open = useCallback((m: Mode) => {
    if (!sessionRef.current) return
    openedAt.current = Date.now()
    setMode(m)
  }, [])
  const close = useCallback(() => {
    lastActivity.current = Date.now()
    setMode(null)
  }, [])

  const toggleTimer = useCallback(() => {
    const s = sessionRef.current
    if (!s) {
      void start({ subjectId: params.get('subject'), plannedMinutes: null })
      return
    }
    if (s.timer.phase === 'done') return
    if (s.timer.runningSince !== null) pause()
    else resume()
  }, [pause, resume, start, params])

  // Sin sesión no hay nada que mostrar.
  useEffect(() => {
    if (!session) setMode(null)
  }, [session])

  useEffect(() => {
    const onOpen = () => open('manual')
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [open])

  // Actividad dentro de la app (captura: cuenta aunque un componente frene el evento).
  useEffect(() => {
    const mark = () => (lastActivity.current = Date.now())
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, mark, { capture: true, passive: true }))
    return () => evs.forEach((e) => window.removeEventListener(e, mark, { capture: true }))
  }, [])

  // Apertura automática.
  useEffect(() => {
    if (!focusCfg.auto || !running || mode || readingPdf) return
    lastActivity.current = Math.max(lastActivity.current, Date.now() - 1000)
    const id = window.setInterval(() => {
      if (document.hidden || somethingOpen()) return
      if (Date.now() - lastActivity.current >= focusCfg.seconds * 1000) open('auto')
    }, 1000)
    return () => window.clearInterval(id)
  }, [focusCfg.auto, focusCfg.seconds, running, mode, readingPdf, open])

  // Atajos globales del cronómetro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || !e.shiftKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'p') {
        e.preventDefault()
        toggleTimer()
      } else if (k === 'f' && sessionRef.current) {
        e.preventDefault()
        if (mode) close()
        else open('manual')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleTimer, mode, open, close])

  // Teclado y salida mientras la vista está abierta.
  useEffect(() => {
    if (!mode) return
    let origin: { x: number; y: number } | null = null
    const inGrace = () => Date.now() - openedAt.current < GRACE_MS

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return // los atajos globales siguen funcionando
      const k = e.key.toLowerCase()
      const handled = k === ' ' || k === 's' || k === 'escape' || k === '+' || k === '=' || k === '-'
      if (handled) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      // Espacio siempre pausa/reanuda (aunque haya un botón enfocado); Enter activa el botón enfocado.
      if (k === ' ') toggleTimer()
      else if (k === 's') skip()
      else if (k === '+' || k === '=') adjust(5)
      else if (k === '-') adjust(-5)
      else if (k === 'escape') close()
      else if (k !== 'tab' && mode === 'auto' && !inGrace()) close()
    }
    const onMove = (e: PointerEvent) => {
      if (mode !== 'auto' || inGrace()) return
      if (!origin) {
        origin = { x: e.clientX, y: e.clientY }
        return
      }
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_THRESHOLD_PX) close()
    }
    const onWheel = () => mode === 'auto' && !inGrace() && close()

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('wheel', onWheel, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [mode, toggleTimer, skip, adjust, close])

  return (
    <AnimatePresence>
      {mode && session && (
        <FocusView
          key="focus"
          mode={mode}
          session={session}
          now={now}
          onToggle={toggleTimer}
          onSkip={skip}
          onAdjust={adjust}
          onStop={() => {
            close()
            void stop()
          }}
          onClose={close}
        />
      )}
    </AnimatePresence>
  )
}

function FocusView({
  mode,
  session,
  now,
  onToggle,
  onSkip,
  onAdjust,
  onStop,
  onClose
}: {
  mode: Mode
  session: NonNullable<ReturnType<typeof useSession>['session']>
  now: number
  onToggle: () => void
  onSkip: () => void
  onAdjust: (minutes: number) => void
  onStop: () => void
  onClose: () => void
}) {
  const { data: settings } = useSettings()
  const bgUrl = useBackgroundUrl(settings?.background.fileName)
  const [confirmStop, setConfirmStop] = useState(false)

  const t = session.timer
  const running = t.runningSince !== null
  const done = t.phase === 'done'
  const remaining = done ? 0 : phaseRemaining(t, now)
  const progress = done ? 1 : t.phaseDurationMs ? Math.min(1, phaseElapsed(t, now) / t.phaseDurationMs) : 0
  const status = done ? 'Bloque completo' : t.phase === 'break' ? 'Descanso' : running ? 'En foco' : 'En pausa'
  const tone = done ? 'text-accent' : t.phase === 'break' ? 'text-warning' : running ? 'text-success' : 'text-fg-subtle'
  const stroke = done ? 'stroke-accent' : t.phase === 'break' ? 'stroke-warning' : 'stroke-success'
  const focused = activeSeconds(t, now)
  const minutesLeft = Math.ceil(remaining / 60_000)

  // El tiempo también va en el título de la ventana (se ve en el Dock / la barra de tareas).
  useEffect(() => {
    const prev = document.title
    document.title = `${formatClock(remaining)} · ${status}`
    return () => {
      document.title = prev
    }
  }, [remaining, status])

  const r = 46
  const c = 2 * Math.PI * r

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Vista de foco"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_MAC } }}
      exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_OUT_MAC } }}
      style={{ backgroundColor: 'var(--canvas)' }}
      className="fixed inset-0 z-[250] flex flex-col items-center justify-center overflow-hidden select-none"
    >
      {bgUrl && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="away-bg" style={{ backgroundImage: `url("${bgUrl}")` }} />
          <div className="away-bg-tint" />
        </div>
      )}

      {/* Lectores de pantalla: se anuncia el estado y los minutos restantes, no cada segundo. */}
      <p className="sr-only" aria-live="polite">
        {status}
        {!done && `, quedan ${minutesLeft} ${minutesLeft === 1 ? 'minuto' : 'minutos'}`}
      </p>

      <div className="away-text relative flex flex-col items-center">
        <p className={cn('mb-6 text-sm font-semibold tracking-[0.2em] uppercase', tone, running && 'live-pulse')}>{status}</p>

        <div
          role="timer"
          aria-label={`Tiempo restante: ${formatClock(remaining)}`}
          className="relative h-[min(56vh,360px)] w-[min(56vh,360px)]"
        >
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="2.2" className="stroke-surface-2" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', stroke)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[min(13vh,84px)] leading-none font-extralight tracking-tight text-fg tabular-nums">
              {formatClock(remaining)}
            </span>
            <SessionSubjectPicker className="mt-3 max-w-[70%] gap-2 text-sm text-fg-muted" dotClassName="h-2.5 w-2.5" />
            {session.mode && <span className="mt-1 text-xs text-fg-subtle">{studyModeLabel(session.mode)}</span>}
          </div>
        </div>

        {!done && (
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAdjust(-5)}
              title="Restar 5 minutos (−)"
              aria-label="Restar 5 minutos a esta fase"
              className="h-8 rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
            >
              −5 min
            </button>
            <button
              type="button"
              onClick={() => onAdjust(5)}
              title="Sumar 5 minutos (+)"
              aria-label="Sumar 5 minutos a esta fase"
              className="h-8 rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
            >
              +5 min
            </button>
          </div>
        )}

        <p className="mt-4 text-sm text-fg-muted tabular-nums">
          {focused >= 60 ? `${formatDuration(focused)} de foco` : 'Recién empezás'} · ciclo {t.cycle}
        </p>

        <div className="mt-6 flex items-center gap-2">
          {!done && (
            <BigButton label={running ? 'Pausar' : 'Reanudar'} kbd="Espacio" onClick={onToggle} primary>
              {running ? <Pause size={20} /> : <Play size={20} />}
            </BigButton>
          )}
          {!done && (
            <BigButton label={t.phase === 'break' ? 'Saltar descanso' : 'Pasar al descanso'} kbd="S" onClick={onSkip}>
              <SkipForward size={20} />
            </BigButton>
          )}
          {confirmStop ? (
            <div className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-surface px-2 py-1">
              <span className="pl-2 text-xs text-fg-muted">¿Terminar la sesión?</span>
              <button type="button" autoFocus onClick={onStop} className="h-8 rounded-full bg-danger px-3 text-xs font-medium text-white">
                Terminar
              </button>
              <button type="button" onClick={() => setConfirmStop(false)} className="h-8 rounded-full px-3 text-xs text-fg-muted hover:bg-hover">
                No
              </button>
            </div>
          ) : (
            <BigButton label="Terminar sesión" onClick={() => setConfirmStop(true)} danger>
              <Square size={16} fill="currentColor" />
            </BigButton>
          )}
          <BigButton label="Salir de la vista de foco" kbd="Esc" onClick={onClose}>
            <Minimize2 size={18} />
          </BigButton>
        </div>

        <p className="mt-6 text-xs text-fg-subtle">
          {mode === 'auto' ? 'Mové el mouse o tocá una tecla para volver · ' : ''}
          Espacio pausa · S salta · +/− 5 min · Esc sale · {TIMER_SHORTCUTS.toggle} pausa desde cualquier lado
        </p>
      </div>
    </motion.div>
  )
}

function BigButton({
  label,
  kbd,
  onClick,
  children,
  primary,
  danger
}: {
  label: string
  kbd?: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  danger?: boolean
}) {
  const title = kbd ? `${label} (${kbd})` : label
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
        primary
          ? 'h-14 w-14 border-transparent bg-accent text-accent-fg hover:brightness-110'
          : danger
            ? 'border-line bg-surface text-danger hover:bg-danger/15'
            : 'border-line bg-surface text-fg-muted hover:bg-hover hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}
