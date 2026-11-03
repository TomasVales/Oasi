import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AppSettings, ThemeName } from '@shared/settings'
import { nextTheme } from '@shared/theme'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'

interface ThemeContextValue {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: ThemeName) {
  const root = document.documentElement
  if (root.dataset['theme'] === theme) return
  // La clase activa transiciones de color solo durante el cambio.
  root.classList.add('theme-transition')
  root.dataset['theme'] = theme
  window.setTimeout(() => root.classList.remove('theme-transition'), 260)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // El preload ya aplicó el tema guardado al <html>; arrancamos sincronizados con él.
  const [theme, setThemeState] = useState<ThemeName>(api.app.initialTheme)
  const qc = useQueryClient()

  useEffect(() => applyTheme(theme), [theme])

  const setTheme = useCallback(
    (t: ThemeName) => {
      setThemeState(t) // optimista: el cambio visual es instantáneo
      qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, theme: t } : s))
      void api.settings.set('theme', t)
    },
    [qc]
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, cycleTheme: () => setTheme(nextTheme(theme)) }),
    [theme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
