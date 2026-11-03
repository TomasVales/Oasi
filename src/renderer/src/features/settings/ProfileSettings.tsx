import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MonitorPause, RotateCcw } from 'lucide-react'
import type { AppSettings } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { previewAwayScreen } from '@/features/away/AwayScreen'

const MINUTES = [5, 10, 15, 20, 30]

export function ProfileSettingsSection() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const [name, setName] = useState('')
  useEffect(() => {
    if (settings) setName(settings.profile.name)
  }, [settings?.profile.name]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!settings) return null

  const save = <K extends 'profile' | 'idle' | 'onboarding'>(key: K, value: AppSettings[K]) => {
    qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, [key]: value } : s))
    void api.settings.set(key, value)
  }
  const idle = settings.idle

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Perfil y modo ausente</h2>
        <p className="text-xs text-fg-muted">Si dejás la computadora, la app pausa el cronómetro (sin contar los minutos inactivos) y muestra un salvapantallas.</p>
      </div>
      <Card className="space-y-4 p-4">
        <Field label="Tu nombre" hint="Aparece en el saludo de Inicio y en el salvapantallas.">
          <Input
            value={name}
            maxLength={60}
            placeholder="¿Cómo te llamás?"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== settings.profile.name && save('profile', { name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={idle.enabled}
              onChange={(e) => save('idle', { ...idle, enabled: e.target.checked })}
            />
            Activar modo ausente tras
          </label>
          <div role="radiogroup" aria-label="Minutos de inactividad" className={cn('flex rounded-card bg-surface-2 p-1', !idle.enabled && 'opacity-50')}>
            {MINUTES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={idle.minutes === m}
                disabled={!idle.enabled}
                onClick={() => save('idle', { ...idle, minutes: m })}
                className={cn(
                  'h-7 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium',
                  idle.minutes === m ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg' : 'text-fg-muted hover:text-fg'
                )}
              >
                {m} min
              </button>
            ))}
          </div>
          <span className="text-xs text-fg-subtle">sin usar mouse ni teclado (también al bloquear la pantalla).</span>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" onClick={previewAwayScreen}>
            <MonitorPause size={13} /> Ver salvapantallas
          </Button>
        </div>
        <div className="border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={() => save('onboarding', { completedAt: null })}>
            <RotateCcw size={13} /> Volver a ver la bienvenida
          </Button>
        </div>
      </Card>
    </section>
  )
}
