import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ALL_NAV } from '@/navigation'
import { useTheme } from '@/theme/ThemeProvider'

const isMac = window.studentOS.app.platform === 'darwin'

/**
 * ⌘/Ctrl + 1…5  → secciones      ⌘/Ctrl + ,  → ajustes
 * ⌘/Ctrl + ⇧ + T → siguiente tema  ⌘/Ctrl + \  → colapsar barra lateral
 */
export function useGlobalShortcuts({ toggleSidebar }: { toggleSidebar: () => void }) {
  const navigate = useNavigate()
  const { cycleTheme } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return

      if (e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        cycleTheme()
        return
      }
      if (e.shiftKey) return

      if (e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      const item = ALL_NAV.find((n) => n.shortcut === e.key)
      if (item) {
        e.preventDefault()
        navigate(item.path)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, cycleTheme, toggleSidebar])
}
