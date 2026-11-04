import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { StudyMode } from '@shared/planner'
import {
  activeSeconds,
  adjustPhase,
  pauseTimer,
  resumeTimer,
  skipPhase,
  startTimer,
  tickTimer,
  type TimerState
} from '@shared/timer'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'

export interface StartOptions {
  subjectId: string | null
  /** null = sesión libre. */
  plannedMinutes: number | null
  mode?: StudyMode
  documentId?: string | null
  eventId?: string | null
  pagesFrom?: number | null
}

/** Sesión recién terminada, para la pregunta corta del final (foco y página). */
export interface FinishedSession {
  id: string
  activeSeconds: number
  documentId: string | null
  pagesTo: number | null
}

/** Por debajo de esto no se pregunta nada al terminar (fue una prueba o un arranque en falso). */
const REFLECTION_MIN_SECONDS = 5 * 60

export interface ActiveSession {
  id: string
  subjectId: string | null
  mode: StudyMode | null
  documentId: string | null
  timer: TimerState
}

interface SessionContextValue {
  session: ActiveSession | null
  now: number
  start: (opts: StartOptions) => Promise<void>
  pause: () => void
  /** Pausa como si se hubiera pausado en `at` (epoch ms): descuenta tiempo de inactividad. */
  pauseAt: (at: number) => void
  resume: () => void
  skip: () => void
  /** Suma o resta minutos a la fase actual. */
  adjust: (minutes: number) => void
  stop: () => Promise<void>
  finished: FinishedSession | null
  clearFinished: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

const HEARTBEAT_MS = 15_000

function notify(title: string, body: string) {
  try {
    new Notification(title, { body, silent: false })
  } catch {
    /* notificaciones no disponibles */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [finished, setFinished] = useState<FinishedSession | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const pomodoro = settings?.pomodoro ?? DEFAULT_SETTINGS.pomodoro

  const refreshStats = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.stats })
    void qc.invalidateQueries({ queryKey: queryKeys.plan })
  }, [qc])

  // Si la vista se recargó con una sesión abierta, se retoma en pausa con el tiempo guardado.
  useEffect(() => {
    void api.sessions.active().then((row) => {
      if (!row || sessionRef.current) return
      const planned = row.plannedSeconds ? Math.round(row.plannedSeconds / 60) : null
      const base = startTimer({ ...pomodoro, plannedMinutes: planned }, Date.now())
      setSession({
        id: row.id,
        subjectId: row.subjectId,
        mode: null,
        documentId: row.documentId,
        timer: { ...base, runningSince: null, focusDoneMs: row.activeSeconds * 1000 }
      })
    })
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reloj: avanza fases y notifica.
  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      const current = sessionRef.current
      if (!current) return
      const { state, finished } = tickTimer(current.timer, t)
      if (state === current.timer) return
      setSession({ ...current, timer: state })
      if (finished === 'focus' && state.phase === 'break')
        notify('Descanso', `Buen trabajo. Descansá ${Math.round(state.phaseDurationMs / 60_000)} minutos.`)
      if (finished === 'focus' && state.phase === 'done') notify('Bloque completado', 'Terminaste el bloque planificado.')
      if (finished === 'break') notify('Volvamos', 'Terminó el descanso. Retomá cuando estés listo.')
    }, 1000)
    return () => window.clearInterval(id)
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat: persiste el tiempo efectivo por si la app se cierra de golpe.
  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => {
      const s = sessionRef.current
      if (s) void api.sessions.heartbeat(s.id, activeSeconds(s.timer, Date.now()))
    }, HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const finishCurrent = useCallback(async (reflect = false) => {
    const s = sessionRef.current
    if (!s) return
    setSession(null)
    const seconds = activeSeconds(s.timer, Date.now())
    let pagesTo: number | null = null
    if (s.documentId) pagesTo = await api.documents.get(s.documentId).then((d) => d.maxPageRead || null).catch(() => null)
    await api.sessions.finish(s.id, { activeSeconds: seconds, pagesTo })
    refreshStats()
    if (reflect && seconds >= REFLECTION_MIN_SECONDS) setFinished({ id: s.id, activeSeconds: seconds, documentId: s.documentId, pagesTo })
  }, [refreshStats])

  const start = useCallback(
    async (opts: StartOptions) => {
      await finishCurrent()
      const checkIn = await api.checkIns.today()
      const row = await api.sessions.start({
        subjectId: opts.subjectId,
        documentId: opts.documentId ?? null,
        eventId: opts.eventId ?? null,
        checkInId: checkIn?.id ?? null,
        plannedSeconds: opts.plannedMinutes ? opts.plannedMinutes * 60 : null,
        pagesFrom: opts.pagesFrom ?? null
      })
      const t = Date.now()
      setNow(t)
      setSession({
        id: row.id,
        subjectId: opts.subjectId,
        mode: opts.mode ?? null,
        documentId: opts.documentId ?? null,
        timer: startTimer({ ...pomodoro, plannedMinutes: opts.plannedMinutes }, t)
      })
    },
    [finishCurrent, pomodoro]
  )

  const update = (fn: (t: TimerState, now: number) => TimerState) => {
    const s = sessionRef.current
    if (!s) return
    const t = Date.now()
    setNow(t)
    setSession({ ...s, timer: fn(s.timer, t) })
  }

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      now,
      start,
      pause: () => update(pauseTimer),
      pauseAt: (at: number) => update((t, now) => pauseTimer(t, Math.max(t.runningSince ?? 0, Math.min(at, now)))),
      resume: () => update(resumeTimer),
      skip: () => update(skipPhase),
      adjust: (minutes: number) => update((t, now) => adjustPhase(t, minutes * 60_000, now)),
      stop: () => finishCurrent(true),
      finished,
      clearFinished: () => setFinished(null)
    }),
    // update es estable en la práctica (lee refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, now, start, finishCurrent, finished]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
