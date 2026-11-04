import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { THEMES, type ThemeName } from '@shared/settings'
import { THEME_META } from '@shared/theme'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { THEME_ICONS } from '@/components/layout/ThemeSwitcher'
import { Card } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { MOD_KEY_LABEL } from '@/navigation'
import { useTheme } from '@/theme/ThemeProvider'
import { AiSettingsSection } from '@/features/settings/AiSettings'
import { AppIconPicker } from '@/features/settings/AppIconPicker'
import { BackgroundSettingsSection } from '@/features/settings/BackgroundSettings'
import { ProfileSettingsSection } from '@/features/settings/ProfileSettings'
import { SoundSettingsSection } from '@/features/settings/SoundSettings'
import { TimerSettingsSection } from '@/features/settings/TimerSettings'
import { GoogleSettingsSection } from '@/features/settings/GoogleSettings'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const info = useQuery({ queryKey: queryKeys.appInfo, queryFn: () => api.app.getInfo() })

  return (
    <Page>
      <PageHeader title="Ajustes" />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Apariencia</h2>
          <p className="text-xs text-fg-muted">
            Cambia toda la interfaz al instante. Atajo: {MOD_KEY_LABEL}⇧T
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeCard key={t} name={t} active={t === theme} onSelect={() => setTheme(t)} />
          ))}
        </div>
        <AppIconPicker />
        <BackgroundSettingsSection />
      </section>

      <div className="mt-10">
        <TimerSettingsSection />
      </div>
      <div className="mt-10">
        <ProfileSettingsSection />
      </div>
      <div className="mt-10">
        <SoundSettingsSection />
      </div>
      <div className="mt-10">
        <AiSettingsSection />
      </div>
      <div className="mt-10">
        <GoogleSettingsSection />
      </div>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold">Datos</h2>
        <Card className="divide-y divide-line text-sm">
          <Row label="Base de datos" value={info.data?.dbPath} mono />
          <Row label="Versión" value={info.data && `v${info.data.version}`} />
          <Row label="Almacenamiento" value="100% local · funciona sin conexión" />
        </Card>
      </section>
    </Page>
  )
}

function Row({ label, value, mono }: { label: string; value?: string | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <span className="text-fg-muted">{label}</span>
      <span className={cn('selectable truncate text-right', mono && 'font-mono text-xs')}>{value ?? '…'}</span>
    </div>
  )
}

// Clases literales: Tailwind no detecta nombres construidos dinámicamente.
const HEAT = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4']

/**
 * La miniatura se pinta con el propio tema: el contenedor lleva data-theme,
 * así que los tokens (bg-canvas, bg-heat-*, …) se resuelven con sus colores.
 */
function ThemeCard({ name, active, onSelect }: { name: ThemeName; active: boolean; onSelect: () => void }) {
  const meta = THEME_META[name]
  const Icon = THEME_ICONS[name]
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'overflow-hidden rounded-card border text-left transition-shadow',
        active ? 'border-accent ring-2 ring-accent/30 arcade:shadow-glow' : 'border-line hover:border-line-strong'
      )}
    >
      <div data-theme={name} className="flex h-28 gap-2 bg-canvas p-3 text-fg">
        <div className="flex w-10 flex-col gap-1.5 rounded-[4px] bg-sidebar p-1.5">
          <span className="h-1.5 rounded-full bg-accent" />
          <span className="h-1.5 rounded-full bg-line-strong" />
          <span className="h-1.5 rounded-full bg-line-strong" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <span className="h-2 w-2/3 rounded-full bg-fg/80" />
          <span className="h-1.5 w-1/2 rounded-full bg-fg-subtle" />
          <div className="mt-auto grid grid-cols-7 gap-[3px]">
            {[0, 1, 3, 2, 4, 1, 0, 2, 3, 4, 2, 1, 3, 4].map((l, i) => (
              <span key={i} className={cn('aspect-square rounded-[2px]', HEAT[l])} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5">
        <Icon size={14} className="text-fg-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="truncate text-[11px] text-fg-muted">{meta.tagline}</p>
        </div>
        {active && <Check size={14} className="text-accent" />}
      </div>
    </button>
  )
}
