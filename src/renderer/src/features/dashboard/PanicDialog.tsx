import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BatteryFull, BatteryLow, BatteryMedium, Siren } from 'lucide-react'
import type { EnergyLevel } from '@shared/domain'
import { cn } from '@/lib/cn'
import { timeFmt } from '@/lib/format'
import { dialog, fade } from '@/lib/motion'
import { Button } from '@/components/ui/Button'

const ENERGY = [
  { value: 'low' as const, label: 'Baja', icon: BatteryLow, tone: 'text-danger' },
  { value: 'medium' as const, label: 'Media', icon: BatteryMedium, tone: 'text-warning' },
  { value: 'high' as const, label: 'Alta', icon: BatteryFull, tone: 'text-success' }
]

/** Recálculo de pánico: energía actual + recuperar o no lo atrasado. Enter confirma. */
export function PanicDialog({
  energy: initialEnergy,
  behindMinutes,
  busy,
  onConfirm,
  onClose
}: {
  energy: EnergyLevel
  behindMinutes: number
  busy: boolean
  onConfirm: (opts: { energy: EnergyLevel; recover: boolean }) => void
  onClose: () => void
}) {
  const [energy, setEnergy] = useState<EnergyLevel>(initialEnergy)
  const [recover, setRecover] = useState(behindMinutes > 0)
  const start = new Date(Math.ceil(Date.now() / 300_000) * 300_000)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !busy) onConfirm({ energy, recover })
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0) setEnergy(ENERGY[i]!.value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <motion.div
        variants={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panic-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-[12px] border border-line bg-surface shadow-2xl"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <Siren size={19} />
            </div>
            <div>
              <h2 id="panic-title" className="font-display text-lg font-semibold">
                Recalcular el resto del día
              </h2>
              <p className="text-sm text-fg-muted">Rearmo los bloques desde las {timeFmt.format(start)} con el tiempo que realmente queda.</p>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-fg-muted">¿Cómo está tu energía ahora?</legend>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY.map((e, i) => (
                <button
                  key={e.value}
                  type="button"
                  aria-pressed={energy === e.value}
                  onClick={() => setEnergy(e.value)}
                  className={cn(
                    'relative flex items-center justify-center gap-1.5 rounded-card border-2 py-2 text-sm font-medium',
                    energy === e.value ? 'border-accent bg-accent-soft' : 'border-transparent bg-surface-2 hover:bg-hover'
                  )}
                >
                  <e.icon size={16} className={e.tone} /> {e.label}
                  <kbd className="absolute top-0.5 right-1.5 font-mono text-[9px] text-fg-subtle">{i + 1}</kbd>
                </button>
              ))}
            </div>
          </fieldset>

          <label className={cn('flex items-start gap-2.5 rounded-card border border-line p-3 text-sm', behindMinutes === 0 && 'opacity-50')}>
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--accent)]"
              checked={recover}
              disabled={behindMinutes === 0}
              onChange={(e) => setRecover(e.target.checked)}
            />
            <span>
              <span className="font-medium">Recuperar lo atrasado</span>
              <span className="block text-xs text-fg-muted">
                {behindMinutes > 0
                  ? `Las materias con ${behindMinutes} min pendientes pasan adelante. Sin tildar, se reparte el día de cero.`
                  : 'No hay bloques atrasados: se reparte el resto del día de cero.'}
              </span>
            </span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 bg-panel px-5 py-3">
          <span className="mr-auto text-[11px] text-fg-subtle">↵ para confirmar</span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => onConfirm({ energy, recover })}>
            Recalcular ahora
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
