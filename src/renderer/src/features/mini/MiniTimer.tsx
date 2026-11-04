import { useEffect, useState } from 'react'
import { Maximize2, Pause, Play, SkipForward, X } from 'lucide-react'
import type { MiniCommand, MiniState } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

const send = (cmd: MiniCommand) => api.mini.command(cmd)

/**
 * Contenido de la ventanita flotante (ventana aparte, sin el resto de la app).
 * Se arrastra desde cualquier lado; un clic en el tiempo abre Oasi.
 */
export function MiniTimer() {
  const [s, setS] = useState<MiniState | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('mini-window')
    return api.mini.onState(setS)
  }, [])
  useEffect(() => {
    if (s) document.documentElement.dataset['theme'] = s.theme
  }, [s?.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null
  const done = s.phase === 'done'
  const stroke = done ? 'stroke-accent' : s.phase === 'break' ? 'stroke-warning' : s.running ? 'stroke-success' : 'stroke-fg-subtle'
  const tone = done ? 'text-accent' : s.phase === 'break' ? 'text-warning' : s.running ? 'text-success' : 'text-fg-subtle'
  const r = 15
  const c = 2 * Math.PI * r

  return (
    <div className="drag-region group flex h-screen w-screen items-center gap-3.5 rounded-[18px] border border-line bg-surface pr-2.5 pl-4 text-fg select-none">
      <svg viewBox="0 0 36 36" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-surface-2" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - s.progress)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', stroke)}
        />
      </svg>
      {/* El tiempo tiene su propio espacio: los botones nunca lo tapan (no cambian el layout al aparecer). */}
      <button type="button" onClick={() => send('open')} title="Abrir Oasi" className="no-drag min-w-0 flex-1 overflow-hidden text-left">
        <p className="font-display text-[34px] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums">{s.remaining}</p>
        <p className="mt-1 truncate text-xs text-fg-muted">
          <span className={cn('font-semibold', tone)}>{s.label}</span> · {s.subject}
        </p>
      </button>
      <div className="no-drag grid shrink-0 grid-cols-2 gap-0.5">
        {done ? (
          <span className="h-8 w-8" />
        ) : (
          <MiniButton label={s.running ? 'Pausar' : 'Reanudar'} onClick={() => send('toggle')}>
            {s.running ? <Pause size={16} /> : <Play size={16} />}
          </MiniButton>
        )}
        <MiniButton label="Ocultar hasta la próxima sesión" onClick={() => send('dismiss')} hoverOnly>
          <X size={15} />
        </MiniButton>
        {done ? (
          <span className="h-8 w-8" />
        ) : (
          <MiniButton label={s.phase === 'break' ? 'Saltar descanso' : 'Pasar al descanso'} onClick={() => send('skip')} hoverOnly>
            <SkipForward size={15} />
          </MiniButton>
        )}
        <MiniButton label="Vista de foco" onClick={() => send('focus')} hoverOnly>
          <Maximize2 size={14} />
        </MiniButton>
      </div>
    </div>
  )
}

function MiniButton({ label, onClick, children, hoverOnly }: { label: string; onClick: () => void; children: React.ReactNode; hoverOnly?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-[8px] text-fg-muted transition-opacity hover:bg-hover hover:text-fg',
        // Ocultos con opacidad (no con display): ocupan su lugar siempre y no empujan el tiempo.
        hoverOnly && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      )}
    >
      {children}
    </button>
  )
}
