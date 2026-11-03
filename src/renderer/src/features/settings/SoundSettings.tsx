import { Headphones, Pause, Play } from 'lucide-react'
import type { SoundscapeId } from '@shared/settings'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { SOUND_META } from '@/features/sound/SoundPlayer'
import { useSoundscape } from '@/features/sound/SoundscapeProvider'

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn('flex items-start gap-3', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </label>
  )
}

export function SoundSettingsSection() {
  const { settings, playing, play, stop, setVolume, update } = useSoundscape()
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Headphones size={15} /> Sonidos ambiente
        </h2>
        <p className="text-xs text-fg-muted">Generados en tiempo real en tu computadora: funcionan sin internet y nunca se repiten en loop.</p>
      </div>
      <Card className="space-y-4 p-4">
        <Toggle label="Activar sonidos ambiente" hint="Muestra el reproductor en el panel y en la sesión de estudio." checked={settings.enabled} onChange={(v) => update({ enabled: v })} />
        <Toggle
          label="Reproducir al empezar el foco"
          hint="Arranca solo con el cronómetro y se apaga al pausar o terminar."
          checked={settings.autoplay}
          disabled={!settings.enabled}
          onChange={(v) => update({ autoplay: v })}
        />
        <Toggle
          label="Silenciar en los descansos"
          hint="Vuelve solo cuando retomás el foco."
          checked={settings.pauseOnBreak}
          disabled={!settings.enabled}
          onChange={(v) => update({ pauseOnBreak: v })}
        />

        <div className={cn('space-y-2', !settings.enabled && 'pointer-events-none opacity-50')}>
          <p className="text-xs font-medium text-fg-muted">Sonido predeterminado</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Sonido predeterminado">
            {(Object.keys(SOUND_META) as SoundscapeId[]).map((id) => {
              const M = SOUND_META[id]
              const active = settings.sound === id
              const previewing = playing === id
              return (
                <div
                  key={id}
                  className={cn('relative rounded-card border p-2.5 transition-colors', active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}
                >
                  <button type="button" role="radio" aria-checked={active} onClick={() => update({ sound: id })} className="block w-full text-left">
                    <M.icon size={18} className={active ? 'text-accent' : 'text-fg-muted'} />
                    <span className="mt-1 block text-sm font-medium">{M.label}</span>
                    <span className="block text-[11px] leading-tight text-fg-subtle">{M.hint}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={previewing ? `Detener ${M.label}` : `Escuchar ${M.label}`}
                    title={previewing ? 'Detener' : 'Escuchar'}
                    onClick={() => (previewing ? stop() : play(id))}
                    className={cn(
                      'absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full',
                      previewing ? 'bg-success text-white' : 'bg-surface text-fg-muted hover:text-fg'
                    )}
                  >
                    {previewing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                  </button>
                </div>
              )
            })}
          </div>
          <label className="flex items-center gap-3 pt-1 text-xs text-fg-muted">
            Volumen
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              defaultValue={settings.volume}
              aria-label="Volumen predeterminado"
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-48 accent-[var(--accent)]"
            />
            <span className="tabular-nums">{Math.round(settings.volume * 100)}%</span>
          </label>
        </div>
      </Card>
    </section>
  )
}
