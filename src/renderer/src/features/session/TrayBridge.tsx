import { useEffect, useRef } from 'react'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { phaseRemaining } from '@shared/timer'
import { api } from '@/lib/api'
import { formatClock } from '@/lib/format'
import { useSettings } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { openFocusMode } from '@/features/focus/FocusOverlay'
import { useSession } from './SessionProvider'

/** Mantiene el contador de la barra de menú al día y ejecuta lo que se elige en su menú. */
export function TrayBridge() {
  const { session, now, pause, resume, skip, adjust, stop } = useSession()
  const { data: settings } = useSettings()
  const { data: subjects } = useSubjects()
  const enabled = settings?.menuBarTimer ?? DEFAULT_SETTINGS.menuBarTimer
  const lastSent = useRef('')

  useEffect(() => {
    if (!session || !enabled) {
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
      phase: t.phase
    }
    const key = JSON.stringify(state)
    if (key === lastSent.current) return
    lastSent.current = key
    api.tray.update(state)
  }, [session, now, enabled, subjects])

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
