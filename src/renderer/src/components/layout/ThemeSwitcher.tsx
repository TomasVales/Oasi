import { Gamepad2, Leaf, Moon, type LucideIcon } from 'lucide-react'
import { THEMES, type ThemeName } from '@shared/settings'
import { THEME_META } from '@shared/theme'
import { cn } from '@/lib/cn'
import { MOD_KEY_LABEL } from '@/navigation'
import { useTheme } from '@/theme/ThemeProvider'

export const THEME_ICONS: Record<ThemeName, LucideIcon> = { zen: Leaf, focus: Moon, arcade: Gamepad2 }

/** Cambio de tema en un clic. Colapsado, un único botón que rota entre los tres. */
export function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme, cycleTheme } = useTheme()

  if (collapsed) {
    const Icon = THEME_ICONS[theme]
    return (
      <button
        onClick={cycleTheme}
        title={`Tema: ${THEME_META[theme].label} (${MOD_KEY_LABEL}⇧T para cambiar)`}
        className="no-drag flex h-9 w-9 items-center justify-center rounded-card text-fg-muted hover:bg-surface-2 hover:text-fg arcade:text-accent"
      >
        <Icon size={16} />
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="no-drag grid grid-cols-3 gap-1 rounded-card bg-surface-2 p-1">
      {THEMES.map((t) => {
        const Icon = THEME_ICONS[t]
        const active = t === theme
        return (
          <button
            key={t}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t)}
            title={`${THEME_META[t].label}: ${THEME_META[t].tagline}`}
            className={cn(
              'flex h-7 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-2px)] text-[11px] font-medium transition-colors',
              active
                ? 'bg-surface text-fg shadow-card arcade:bg-accent arcade:text-accent-fg arcade:shadow-glow'
                : 'text-fg-subtle hover:text-fg'
            )}
          >
            <Icon size={13} />
            {THEME_META[t].label}
          </button>
        )
      })}
    </div>
  )
}
