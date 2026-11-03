import { useEffect, useRef, useState } from 'react'
import { AudioLines, CloudRain, Coffee, Pause, Play, Volume1, Volume2, Waves, Wind, type LucideIcon } from 'lucide-react'
import type { SoundscapeId } from '@shared/settings'
import { cn } from '@/lib/cn'
import { useSoundscape } from './SoundscapeProvider'

export const SOUND_META: Record<SoundscapeId, { label: string; icon: LucideIcon; hint: string }> = {
  rain: { label: 'Lluvia', icon: CloudRain, hint: 'Gotas y un rumor lejano' },
  cafe: { label: 'Cafetería', icon: Coffee, hint: 'Murmullo y tazas' },
  white: { label: 'Ruido blanco', icon: AudioLines, hint: 'Parejo, tapa distracciones' },
  pink: { label: 'Ruido rosa', icon: Wind, hint: 'Más suave que el blanco' },
  brown: { label: 'Ruido marrón', icon: Waves, hint: 'Grave y envolvente' }
}

/** Medidor de nivel: 5 barras que siguen la señal real del analizador (no una animación falsa). */
function LevelMeter({ active }: { active: boolean }) {
  const { level } = useSoundscape()
  const [v, setV] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (!active) {
      setV(0)
      return
    }
    const tick = () => {
      setV((prev) => prev * 0.7 + Math.min(1, level() * 6) * 0.3)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [active, level])
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden data-level={v.toFixed(3)}>
      {[0.35, 0.7, 1, 0.6, 0.85].map((k, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-success transition-[height] duration-75 arcade:shadow-[0_0_4px_var(--success)]"
          style={{ height: `${Math.max(15, Math.min(100, v * k * 100 * (0.8 + ((i * 37) % 5) / 10)))}%`, opacity: active ? 1 : 0.3 }}
        />
      ))}
    </span>
  )
}

/** Reproductor minimalista: elegir sonido, play/pausa, volumen y medidor. */
export function SoundPlayer({ compact }: { compact?: boolean }) {
  const { settings, playing, toggle, setSound, setVolume } = useSoundscape()
  const [vol, setVol] = useState(settings.volume)
  useEffect(() => setVol(settings.volume), [settings.volume])
  if (!settings.enabled) return null

  return (
    <div className={cn('space-y-1.5', compact ? '' : 'p-1')} data-soundscape={playing ?? ''} aria-label="Sonidos ambiente">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pausar sonido ambiente' : 'Reproducir sonido ambiente'}
          title={playing ? 'Pausar sonido' : `Reproducir ${SOUND_META[settings.sound].label.toLowerCase()}`}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
            playing ? 'bg-success text-white' : 'bg-surface-2 text-fg-muted hover:text-fg'
          )}
        >
          {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        <div className="flex flex-1 items-center gap-0.5" role="radiogroup" aria-label="Sonido">
          {(Object.keys(SOUND_META) as SoundscapeId[]).map((id) => {
            const M = SOUND_META[id]
            const active = settings.sound === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={M.label}
                title={`${M.label} · ${M.hint}`}
                onClick={() => setSound(id)}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded-[7px] transition-colors',
                  active ? 'bg-selected text-fg' : 'text-fg-subtle hover:bg-hover hover:text-fg'
                )}
              >
                <M.icon size={14} />
              </button>
            )
          })}
        </div>
        <LevelMeter active={!!playing} />
      </div>
      <label className="flex items-center gap-2 px-0.5">
        {vol < 0.5 ? <Volume1 size={13} className="text-fg-subtle" /> : <Volume2 size={13} className="text-fg-subtle" />}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={vol}
          aria-label="Volumen"
          onChange={(e) => {
            const v = Number(e.target.value)
            setVol(v)
            setVolume(v)
          }}
          className="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
        />
        <span className="w-7 text-right text-[10px] text-fg-subtle tabular-nums">{Math.round(vol * 100)}</span>
      </label>
    </div>
  )
}
