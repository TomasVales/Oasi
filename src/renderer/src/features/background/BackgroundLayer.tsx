import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettings } from '@/hooks/useAppData'
import { EASE_OUT_MAC } from '@/lib/motion'
import { useBackgroundUrl } from './useBackgroundUrl'

/**
 * Fondo global: imagen/GIF + velo del color del tema (opacidad por tema). Marca <html>
 * con data-bg="on" para que las superficies se vuelvan translúcidas (ver styles/background.css).
 */
export function BackgroundLayer() {
  const { data: settings } = useSettings()
  const bg = settings?.background
  const url = useBackgroundUrl(bg?.fileName)

  useEffect(() => {
    const root = document.documentElement
    if (!url || !bg) {
      delete root.dataset['bg']
      return
    }
    root.dataset['bg'] = 'on'
    root.style.setProperty('--bg-overlay-zen', String(bg.overlay.zen))
    root.style.setProperty('--bg-overlay-focus', String(bg.overlay.focus))
    root.style.setProperty('--bg-overlay-arcade', String(bg.overlay.arcade))
    root.style.setProperty('--bg-blur', `${bg.blur}px`)
    return () => {
      delete root.dataset['bg']
    }
  }, [url, bg])

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          key={url}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.6, ease: EASE_OUT_MAC } }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="pointer-events-none fixed inset-0 z-0"
        >
          <div className="app-bg" style={{ backgroundImage: `url("${url}")` }} />
          <div className="app-bg-tint" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
