import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { THEMES, type AppSettings, type BackgroundSettings as BgSettings, type ThemeName } from '@shared/settings'
import { THEME_META } from '@shared/theme'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Button } from '@/components/ui/Button'
import { useBackgroundUrl } from '@/features/background/useBackgroundUrl'
import { useTheme } from '@/theme/ThemeProvider'

export function BackgroundSettingsSection() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { theme } = useTheme()
  const bg = settings?.background
  const url = useBackgroundUrl(bg?.fileName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const saveTimer = useRef<number | null>(null)
  if (!bg) return null

  const apply = (next: BgSettings) => qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, background: next } : s))

  const run = async (fn: () => Promise<BgSettings | null>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await fn()
      if (next) apply(next)
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** Cambios de look: se ven al instante y se guardan con un pequeño retardo. */
  const setLook = (patch: Partial<Pick<BgSettings, 'overlay' | 'blur'>>) => {
    const next = { ...bg, ...patch }
    apply(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void api.background.setLook({ overlay: next.overlay, blur: next.blur }), 250)
  }

  const isGif = bg.mime === 'image/gif'

  return (
    <div className="space-y-3 pt-5">
      <div>
        <p className="text-xs font-medium text-fg-muted">Fondo personalizado</p>
        <p className="text-[11px] text-fg-subtle">Una imagen o GIF tuyo detrás de toda la app, fundido con el color del tema.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* Vista previa: la imagen con el velo del tema actual y una ventana de muestra */}
        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void run(() => api.background.import(api.documents.pathForFile(f)))
          }}
          className={cn(
            'relative aspect-video overflow-hidden rounded-card border',
            over ? 'border-accent ring-2 ring-accent/40' : 'border-line',
            !url && 'border-dashed'
          )}
        >
          {url ? (
            <>
              <div className="absolute inset-[-12px] bg-cover bg-center" style={{ backgroundImage: `url("${url}")`, filter: `blur(${bg.blur / 3}px)` }} />
              <div className="absolute inset-0 bg-canvas" style={{ opacity: bg.overlay[theme] }} />
              {/* Ventana de muestra */}
              <div className="absolute inset-4 flex overflow-hidden rounded-[8px] border border-line shadow-lg">
                <div className="w-8 bg-rail" style={{ opacity: 0.92 }} />
                <div className="w-16 bg-sidebar" style={{ opacity: 0.85 }} />
                <div className="flex-1 space-y-1.5 p-2">
                  <div className="h-2 w-2/3 rounded-full bg-fg/70" />
                  <div className="h-1.5 w-1/2 rounded-full bg-fg-subtle" />
                  <div className="mt-2 h-8 rounded-[4px] bg-surface/90" />
                  <div className="h-8 rounded-[4px] bg-surface/90" />
                </div>
              </div>
            </>
          ) : (
            <button
              onClick={() => void run(() => api.background.choose())}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <ImagePlus size={22} />
              <span className="text-xs">Arrastrá una imagen o GIF acá</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api.background.choose())}>
              <ImagePlus size={13} /> {url ? 'Cambiar imagen' : 'Elegir imagen o GIF'}
            </Button>
            {url && (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void run(() => api.background.clear())}>
                <Trash2 size={13} /> Quitar fondo
              </Button>
            )}
          </div>

          <fieldset disabled={!url} className={cn('space-y-2.5', !url && 'opacity-50')}>
            <legend className="mb-1 text-xs font-medium text-fg-muted">Opacidad del tema sobre la imagen</legend>
            {THEMES.map((t: ThemeName) => (
              <label key={t} className="flex items-center gap-3 text-xs">
                <span className={cn('w-16', t === theme ? 'font-semibold text-fg' : 'text-fg-muted')}>{THEME_META[t].label}</span>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.01}
                  value={bg.overlay[t]}
                  aria-label={`Opacidad en ${THEME_META[t].label}`}
                  onChange={(e) => setLook({ overlay: { ...bg.overlay, [t]: Number(e.target.value) } })}
                  className="h-1 flex-1 accent-[var(--accent)]"
                />
                <span className="w-9 text-right tabular-nums text-fg-subtle">{Math.round(bg.overlay[t] * 100)}%</span>
              </label>
            ))}
            {THEMES.some((t) => bg.overlay[t] < 0.5) && (
              <p className="text-[11px] text-warning">Con menos de 50 % el texto puede costar leerse sobre imágenes muy cargadas.</p>
            )}
            <label className="flex items-center gap-3 pt-1 text-xs">
              <span className="w-16 text-fg-muted">Desenfoque</span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={bg.blur}
                aria-label="Desenfoque del fondo"
                onChange={(e) => setLook({ blur: Number(e.target.value) })}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="w-9 text-right tabular-nums text-fg-subtle">{bg.blur}px</span>
            </label>
          </fieldset>
          {isGif && (
            <p className="text-[11px] text-fg-subtle">
              Los GIF animados con desenfoque usan más batería. Si tenés activado “reducir movimiento” en el sistema, se muestran quietos.
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    </div>
  )
}
