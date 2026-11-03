import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SETTINGS, type AppSettings, type SoundscapeId, type SoundscapeSettings } from '@shared/settings'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { useSession } from '@/features/session/SessionProvider'
import { SoundscapeEngine } from './engine'

interface SoundscapeContextValue {
  settings: SoundscapeSettings
  /** Sonido que suena ahora (null = silencio). */
  playing: SoundscapeId | null
  play: (id?: SoundscapeId) => void
  stop: () => void
  toggle: () => void
  setSound: (id: SoundscapeId) => void
  setVolume: (v: number) => void
  level: () => number
  update: (patch: Partial<SoundscapeSettings>) => void
}

const Ctx = createContext<SoundscapeContextValue | null>(null)

/**
 * Soundscapes acoplados al cronómetro:
 * - Autoplay: al empezar/reanudar el foco suena solo (si está activado).
 * - En pausa y (opcionalmente) en los descansos se silencia; vuelve con el foco.
 * - Si el usuario lo apaga a mano durante una sesión, no vuelve a arrancar solo hasta la próxima.
 * - Lo que el usuario prende a mano no lo corta el cronómetro.
 */
export function SoundscapeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data } = useSettings()
  const settings = data?.soundscape ?? DEFAULT_SETTINGS.soundscape
  const { session } = useSession()
  const engine = useRef<SoundscapeEngine | null>(null)
  engine.current ??= new SoundscapeEngine()
  const [playing, setPlaying] = useState<SoundscapeId | null>(null)
  const auto = useRef(false) // lo que suena fue iniciado por el cronómetro
  const mutedThisSession = useRef<string | null>(null)

  const persist = useCallback(
    (patch: Partial<SoundscapeSettings>) => {
      const next = { ...settings, ...patch }
      qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, soundscape: next } : s))
      void api.settings.set('soundscape', next)
    },
    [settings, qc]
  )

  const start = useCallback(
    (id: SoundscapeId, byTimer: boolean) => {
      engine.current!.setVolume(settings.volume)
      void engine.current!.play(id)
      auto.current = byTimer
      setPlaying(id)
    },
    [settings.volume]
  )

  const silence = useCallback(() => {
    void engine.current!.stop()
    setPlaying(null)
  }, [])

  // Desactivado en Ajustes → silencio inmediato.
  useEffect(() => {
    if (!settings.enabled && playing) silence()
  }, [settings.enabled, playing, silence])

  // Acople con el cronómetro.
  const t = session?.timer
  const focusRunning = !!t && t.phase === 'focus' && t.runningSince !== null
  const inBreak = !!t && t.phase === 'break'
  const sessionId = session?.id ?? null
  useEffect(() => {
    if (!settings.enabled) return
    if (!sessionId) {
      if (auto.current && playing) silence()
      mutedThisSession.current = null
      return
    }
    const wantsSound = focusRunning || (inBreak && !settings.pauseOnBreak && t?.runningSince !== null)
    if (wantsSound && !playing && settings.autoplay && mutedThisSession.current !== sessionId) start(settings.sound, true)
    if (!wantsSound && playing && auto.current) silence()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, focusRunning, inBreak, settings.enabled, settings.autoplay, settings.pauseOnBreak])

  useEffect(() => () => engine.current?.dispose(), [])

  const value = useMemo<SoundscapeContextValue>(
    () => ({
      settings,
      playing,
      play: (id) => start(id ?? settings.sound, false),
      stop: () => {
        if (sessionId) mutedThisSession.current = sessionId
        silence()
      },
      toggle: () => {
        if (playing) {
          if (sessionId) mutedThisSession.current = sessionId
          silence()
        } else start(settings.sound, false)
      },
      setSound: (id) => {
        persist({ sound: id })
        if (playing) {
          engine.current!.setVolume(settings.volume)
          void engine.current!.play(id)
          setPlaying(id)
        }
      },
      setVolume: (v) => {
        engine.current!.setVolume(v)
        persist({ volume: v })
      },
      level: () => engine.current!.level(),
      update: persist
    }),
    [settings, playing, start, silence, persist, sessionId]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSoundscape(): SoundscapeContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSoundscape debe usarse dentro de <SoundscapeProvider>')
  return ctx
}
