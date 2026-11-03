import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { ICON_VARIANT_LABEL, ICON_VARIANTS } from '@shared/pixelIcon'
import type { AppSettings } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { PixelIcon } from '@/components/ui/PixelIcon'

/** Variante del ícono: cambia el logo de la app y el ícono del Dock en vivo. */
export function AppIconPicker() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const current = settings?.appIcon ?? 'clasico'
  return (
    <div className="pt-3">
      <p className="mb-2 text-xs font-medium text-fg-muted">Ícono de la app</p>
      <div className="flex gap-3" role="radiogroup" aria-label="Ícono de la app">
        {ICON_VARIANTS.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={current === v}
            onClick={() => {
              qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, appIcon: v } : s))
              void api.settings.set('appIcon', v)
            }}
            className={cn(
              'relative flex flex-col items-center gap-1.5 rounded-card border p-2.5 transition-colors',
              current === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
            )}
          >
            <PixelIcon variant={v} size={56} />
            <span className="text-xs font-medium">{ICON_VARIANT_LABEL[v]}</span>
            {current === v && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-fg-subtle">Se aplica al logo y al ícono del Dock mientras la app está abierta.</p>
    </div>
  )
}
