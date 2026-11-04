import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import type { AppSettings } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Card } from '@/components/ui/Card'
import { TIMER_SHORTCUTS } from '@/features/focus/FocusOverlay'

const PRESETS = [
  { label: 'Clásico 25/5', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4 },
  { label: 'Largo 50/10', focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 25, cyclesBeforeLongBreak: 3 },
  { label: 'Profundo 90/20', focusMinutes: 90, shortBreakMinutes: 20, longBreakMinutes: 30, cyclesBeforeLongBreak: 2 }
]

const FOCUS_DELAYS = [
  { s: 30, label: '30 s' },
  { s: 60, label: '1 min' },
  { s: 90, label: '1,5 min' },
  { s: 180, label: '3 min' },
  { s: 300, label: '5 min' }
]

type Key = 'pomodoro' | 'streakMinMinutes' | 'focusMode'

/** Duraciones del pomodoro, meta diaria de la racha y vista de foco. */
export function TimerSettingsSection() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  if (!settings) return null

  const save = <K extends Key>(key: K, value: AppSettings[K]) => {
    qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, [key]: value } : s))
    void api.settings.set(key, value).then(() => qc.invalidateQueries({ queryKey: queryKeys.stats }))
  }
  const p = settings.pomodoro
  const focus = settings.focusMode
  const setP = (patch: Partial<typeof p>) => save('pomodoro', { ...p, ...patch })

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Cronómetro</h2>
        <p className="text-xs text-fg-muted">Los cambios se aplican a la próxima sesión que empieces.</p>
      </div>
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Combinaciones sugeridas">
          {PRESETS.map(({ label, ...values }) => {
            const active = (Object.keys(values) as (keyof typeof values)[]).every((k) => p[k] === values[k])
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setP(values)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium',
                  active ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Stepper label="Foco" unit="min" value={p.focusMinutes} min={5} max={180} step={5} onChange={(v) => setP({ focusMinutes: v })} />
          <Stepper label="Descanso corto" unit="min" value={p.shortBreakMinutes} min={1} max={60} onChange={(v) => setP({ shortBreakMinutes: v })} />
          <Stepper label="Descanso largo" unit="min" value={p.longBreakMinutes} min={1} max={90} step={5} onChange={(v) => setP({ longBreakMinutes: v })} />
          <Stepper
            label="Descanso largo cada"
            unit={p.cyclesBeforeLongBreak === 1 ? 'ciclo' : 'ciclos'}
            value={p.cyclesBeforeLongBreak}
            min={1}
            max={10}
            onChange={(v) => setP({ cyclesBeforeLongBreak: v })}
          />
        </div>

        <div className="border-t border-line pt-3">
          <Stepper
            label="Meta diaria para la racha"
            unit="min"
            value={settings.streakMinMinutes}
            min={5}
            max={600}
            step={5}
            hint="Minutos que tenés que estudiar en un día para que sume a la racha."
            onChange={(v) => save('streakMinMinutes', v)}
          />
        </div>

        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={focus.auto}
                onChange={(e) => save('focusMode', { ...focus, auto: e.target.checked })}
              />
              Vista de foco automática tras
            </label>
            <div role="radiogroup" aria-label="Espera antes de la vista de foco" className={cn('flex rounded-card bg-surface-2 p-1', !focus.auto && 'opacity-50')}>
              {FOCUS_DELAYS.map((d) => (
                <button
                  key={d.s}
                  role="radio"
                  aria-checked={focus.seconds === d.s}
                  disabled={!focus.auto}
                  onClick={() => save('focusMode', { ...focus, seconds: d.s })}
                  className={cn(
                    'h-7 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium',
                    focus.seconds === d.s ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-fg-subtle">sin tocar la app mientras el cronómetro corre.</span>
          </div>
          <p className="text-[11px] text-fg-subtle">
            Muestra solo el contador grande y se cierra al mover el mouse o tocar una tecla. No aparece mientras tenés un PDF abierto.
            Atajos: {TIMER_SHORTCUTS.focus} vista de foco · {TIMER_SHORTCUTS.toggle} pausar/reanudar · dentro de la vista: Espacio pausa, S
            salta, + / − suman o restan 5 min, Esc sale.
          </p>
        </div>
      </Card>
    </section>
  )
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  hint,
  onChange
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step?: number
  hint?: string
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))
  const btn = 'flex h-8 w-8 items-center justify-center rounded-card text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={`Restar a ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
            <Minus size={14} />
          </button>
          <input
            type="number"
            aria-label={`${label} (${unit})`}
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= min && v <= max) onChange(clamp(v))
            }}
            className="h-8 w-14 rounded-card border border-line bg-canvas text-center text-sm tabular-nums focus:border-accent focus:outline-none"
          />
          <button type="button" aria-label={`Sumar a ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
            <Plus size={14} />
          </button>
          <span className="w-10 text-xs text-fg-muted">{unit}</span>
        </div>
      </div>
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  )
}
