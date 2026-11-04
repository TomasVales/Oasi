import { useEffect, useRef } from 'react'
import { phaseElapsed, phaseRemaining } from '@shared/timer'
import { api } from '@/lib/api'
import { formatClock } from '@/lib/format'
import { useSubjects } from '@/hooks/useSubjects'
import { openFocusMode } from '@/features/focus/FocusOverlay'
import { useSession } from './SessionProvider'

/**
 * Manda el estado del cronómetro al proceso main (ventanita flotante y Discord; cada
 * una se muestra según su ajuste) y ejecuta lo que se elige en sus menús y botones.
 */
export function TrayBridge() {
  const { session, now, pause, resume, skip, adjust, stop } = useSession()
  const { data: subjects } = useSubjects()
  const lastSent = useRef('')

  useEffect(() => {
    if (!session) {
      if (lastSent.current !== 'null') api.tray.update(null)
      lastSent.current = 'null'
      return
    }
    const t = session.timer
    const running = t.runningSince !== null
    const state = {
      remaining: formatClock(t.phase === 'done' ? 0 : phaseRemaining(t, now)),
      label: t.phase === 'done' ? 'Bloque completo' : t.phase === 'break' ? 'Descanso' : running ? 'En foco' : 'En pausa',
      subject: subjects?.find((s) => s.id === session.subjectId)?.name ?? 'Sesión libre',
      running,
      phase: t.phase,
      progress: t.phase === 'done' ? 1 : t.phaseDurationMs ? Math.min(1, phaseElapsed(t, now) / t.phaseDurationMs) : 0
    }
    const key = JSON.stringify(state)
    if (key === lastSent.current) return
    lastSent.current = key
    api.tray.update(state)
  }, [session, now, subjects])

  // Al cerrar o recargar la ventana se quita el contador (vuelve si la sesión se retoma).
  useEffect(() => {
    const clear = () => api.tray.update(null)
    window.addEventListener('beforeunload', clear)
    return () => window.removeEventListener('beforeunload', clear)
  }, [])

  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(
    () =>
      api.tray.onCommand((cmd) => {
        const s = sessionRef.current
        if (!s) return
        if (cmd === 'toggle' && s.timer.phase !== 'done') (s.timer.runningSince !== null ? pause : resume)()
        else if (cmd === 'skip') skip()
        else if (cmd === 'plus5') adjust(5)
        else if (cmd === 'focus') openFocusMode()
        else if (cmd === 'stop') void stop()
      }),
    [pause, resume, skip, adjust, stop]
  )

  return null
}
