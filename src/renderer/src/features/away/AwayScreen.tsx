import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause } from 'lucide-react'
import { activeSeconds } from '@shared/timer'
import { api } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { EASE_OUT_MAC } from '@/lib/motion'
import { useNow } from '@/hooks/useNow'
import { useSettings } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSession } from '@/features/session/SessionProvider'
import { useBackgroundUrl } from '@/features/background/useBackgroundUrl'

const PREVIEW_EVENT = 'studentos:away-preview'
/** Muestra el salvapantallas (botón "Probar" en Ajustes). */
export const previewAwayScreen = () => window.dispatchEvent(new Event(PREVIEW_EVENT))

/** Evita que el mismo gesto que lo activó (o un toque accidental) lo cierre al instante. */
const DISMISS_GRACE_MS = 600

const clockFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

interface AwayState {
  since: number
  pausedSubjectId: string | null | undefined
  focusSeconds: number
}

/**
 * Modo ausente: tras X minutos sin actividad en el sistema (o al bloquear la pantalla)
 * pausa el cronómetro —descontando los minutos inactivos— y tapa la app con un
 * salvapantallas. Cualquier tecla o clic lo cierra; la sesión queda en pausa.
 */
export function AwayScreen() {
  const [away, setAway] = useState<AwayState | null>(null)
  const { session, pauseAt } = useSession()
  const { data: settings } = useSettings()
  const { data: subjects } = useSubjects()
  const bgUrl = useBackgroundUrl(settings?.background.fileName)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const activate = useCallback(
    (idleSeconds: number) => {
      const s = sessionRef.current
      let pausedSubjectId: string | null | undefined
      let focusSeconds = 0
      const leftAt = Date.now() - idleSeconds * 1000
      if (s && s.timer.runningSince !== null && s.timer.phase === 'focus') {
        pauseAt(leftAt)
        pausedSubjectId = s.subjectId
        focusSeconds = activeSeconds(s.timer, Math.max(s.timer.runningSince, leftAt))
      }
      setAway((prev) => prev ?? { since: Date.now(), pausedSubjectId, focusSeconds })
    },
    [pauseAt]
  )

  useEffect(() => api.onAway((e) => activate(e.idleSeconds)), [activate])
  useEffect(() => {
    const onPreview = () => activate(0)
    window.addEventListener(PREVIEW_EVENT, onPreview)
    return () => window.removeEventListener(PREVIEW_EVENT, onPreview)
  }, [activate])

  useEffect(() => {
    if (!away) return
    const dismiss = (e: Event) => {
      if (Date.now() - away.since < DISMISS_GRACE_MS) {
        // Durante la gracia tampoco se deja pasar el input a la app.
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      setAway(null)
    }
    // Captura: la tecla que lo cierra no debe llegar a la app (p. ej. escribir en un apunte).
    window.addEventListener('keydown', dismiss, true)
    window.addEventListener('mousedown', dismiss, true)
    return () => {
      window.removeEventListener('keydown', dismiss, true)
      window.removeEventListener('mousedown', dismiss, true)
    }
  }, [away])

  const name = settings?.profile.name.trim()
  const paused = away?.pausedSubjectId !== undefined
  const subject = subjects?.find((s) => s.id === away?.pausedSubjectId)

  return (
    <AnimatePresence>
      {away && (
        <motion.div
          key="away"
          role="dialog"
          aria-modal="true"
          aria-label="Modo ausente"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.7, ease: EASE_OUT_MAC } }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE_OUT_MAC } }}
          // Fondo propio y opaco: con fondo personalizado, .bg-canvas se vuelve transparente
          // y dejaba ver la app detrás del saludo.
          style={{ backgroundColor: 'var(--canvas)' }}
          className="away-screen fixed inset-0 z-[300] flex cursor-default items-center justify-center overflow-hidden select-none"
        >
          {bgUrl && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="away-bg" style={{ backgroundImage: `url("${bgUrl}")` }} />
              <div className="away-bg-tint" />
            </div>
          )}
          <Ambient />
          <motion.div
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: 0.2, duration: 0.9, ease: EASE_OUT_MAC } }}
            className="away-text relative flex flex-col items-center gap-3 text-center"
          >
            <Clock />
            <p className="font-display text-2xl font-semibold tracking-tight text-fg arcade:text-glow arcade:text-accent">
              {name ? `Bienvenido ${name}` : 'Bienvenido de nuevo'}
            </p>
            <p className="text-sm text-fg-muted">Pulsa cualquier tecla para continuar</p>
            {paused && (
              <p className="mt-6 flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-xs text-fg-muted backdrop-blur">
                <Pause size={12} />
                Pausamos tu sesión{subject ? ` de ${subject.name}` : ''}
                {away.focusSeconds >= 60 && ` · ${formatDuration(away.focusSeconds)} de foco`}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Clock() {
  const now = useNow(1000)
  const date = dateFmt.format(now)
  return (
    <div className="mb-4">
      <p className="font-display text-[88px] leading-none font-extralight tracking-tight text-fg tabular-nums">{clockFmt.format(now)}</p>
      <p className="mt-2 text-sm text-fg-subtle">{date.charAt(0).toUpperCase() + date.slice(1)}</p>
    </div>
  )
}

/** Dos manchas de color del tema que derivan lentamente (respeta "reducir movimiento"). */
function Ambient() {
  const drift = (x: number[], y: number[], duration: number) => ({
    animate: { x, y },
    transition: { duration, repeat: Infinity, repeatType: 'mirror' as const, ease: 'easeInOut' as const }
  })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div
        {...drift([-120, 80], [-60, 40], 18)}
        className="absolute top-1/4 left-1/4 h-[420px] w-[420px] rounded-full bg-accent opacity-[0.10] blur-[120px]"
      />
      <motion.div
        {...drift([90, -70], [50, -40], 22)}
        className="absolute right-1/4 bottom-1/4 h-[360px] w-[360px] rounded-full bg-accent-2 opacity-[0.08] blur-[110px]"
      />
    </div>
  )
}
