import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DEFAULT_DISCORD, type DiscordSettings } from '@shared/discord'
import type { AppSettings } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Card } from '@/components/ui/Card'
import { usePresence } from '@/features/discord/usePresence'

const OPTIONS: { key: keyof Omit<DiscordSettings, 'enabled'>; label: string; hint: string }[] = [
  { key: 'showSubject', label: 'Mostrar la materia', hint: '"Estudiando Análisis II" en vez de solo "Estudiando".' },
  { key: 'showStats', label: 'Mostrar racha y horas de hoy', hint: 'Al pasar el mouse por el logo de Oasi.' },
  { key: 'showTitles', label: 'Mostrar qué PDF o apunte tenés abierto', hint: 'El título, por ejemplo "Leyendo «Límites y continuidad»".' }
]

/** Qué ven tus amigos de Discord mientras usás Oasi. */
export function DiscordSettingsSection() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const cfg = settings?.discord ?? DEFAULT_DISCORD
  const preview = usePresence(cfg)

  const save = (next: DiscordSettings) => {
    qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, discord: next } : s))
    void api.settings.set('discord', next)
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Discord</h2>
        <p className="text-xs text-fg-muted">Tu perfil muestra lo que estás haciendo en Oasi: qué estudiás, el pomodoro y cuánto falta. Necesita Discord abierto en la compu.</p>
      </div>
      <Card className="grid gap-5 p-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="accent-[var(--accent)]" checked={cfg.enabled} onChange={(e) => save({ ...cfg, enabled: e.target.checked })} />
            Mostrar mi actividad en Discord
          </label>
          {OPTIONS.map((o) => (
            <label key={o.key} className={cn('flex items-start gap-2 pl-5 text-sm', !cfg.enabled && 'opacity-50')}>
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent)]"
                disabled={!cfg.enabled}
                checked={cfg[o.key]}
                onChange={(e) => save({ ...cfg, [o.key]: e.target.checked })}
              />
              <span>
                {o.label}
                <span className="block text-[11px] text-fg-subtle">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Vista previa con el estado real de ahora (se actualiza sola). */}
        <div aria-label="Vista previa en Discord" className={cn('rounded-[10px] bg-[#232428] p-3 text-[#dbdee1]', !cfg.enabled && 'opacity-40')}>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-[#b5bac1] uppercase">Usando una aplicación</p>
          <div className="flex gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[8px] bg-[#2b2d31] text-2xl" title={preview.largeImageText}>
              🌿
            </div>
            <div className="min-w-0 text-[13px] leading-snug">
              <p className="font-semibold text-white">Oasi</p>
              <p className="truncate">{preview.details}</p>
              <p className="truncate">{preview.state}</p>
              <Elapsed start={preview.startTimestamp} end={preview.endTimestamp} />
            </div>
          </div>
          <p className="mt-2 truncate text-[11px] text-[#949ba4]">Al pasar el mouse: {preview.largeImageText}</p>
        </div>
      </Card>
    </section>
  )
}

/** Imita el contador de Discord: "12:34 restantes" o "05:12 transcurrido". */
function Elapsed({ start, end }: { start?: number; end?: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!start && !end) return null
  const ms = end ? Math.max(0, end - now) : now - start!
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return (
    <p className="tabular-nums">
      {h ? `${h}:` : ''}
      {mm}:{ss} {end ? 'restantes' : 'transcurrido'}
    </p>
  )
}
