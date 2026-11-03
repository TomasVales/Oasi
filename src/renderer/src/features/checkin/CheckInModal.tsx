import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dialog, fade } from '@/lib/motion'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { BatteryFull, BatteryLow, BatteryMedium, Check, type LucideIcon } from 'lucide-react'
import type { EnergyLevel } from '@shared/domain'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { queryKeys } from '@/lib/queryClient'
import { useCheckInToday } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'

const OPEN_EVENT = 'studentos:open-checkin'
const DISMISS_KEY = 'checkin.dismissed'

/** Abre el check-in desde cualquier pantalla (p. ej. "Cambiar energía" en Inicio). */
export const openCheckIn = () => window.dispatchEvent(new Event(OPEN_EVENT))

const ENERGY: { value: EnergyLevel; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { value: 'low', label: 'Baja', hint: 'Bloques cortos y repaso', icon: BatteryLow, tone: 'text-danger' },
  { value: 'medium', label: 'Media', hint: 'Práctica y temas conocidos', icon: BatteryMedium, tone: 'text-warning' },
  { value: 'high', label: 'Alta', hint: 'Lo más difícil primero', icon: BatteryFull, tone: 'text-success' }
]

/**
 * Check-in de sesión (≈10 s): energía + materia urgente. Se abre solo al iniciar la app
 * si todavía no se hizo hoy; "Ahora no" lo pospone hasta el próximo inicio.
 */
export function CheckInModal() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const today = useCheckInToday()
  const { data: subjects = [] } = useSubjects()
  const color = useSubjectColor()
  const [open, setOpen] = useState(false)
  const [energy, setEnergy] = useState<EnergyLevel | null>(null)
  const [urgent, setUrgent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      /* sin almacenamiento */
    }
    if (today.isSuccess && today.data === null && !dismissed) setOpen(true)
  }, [today.isSuccess, today.data])

  useEffect(() => {
    const onOpen = () => {
      setEnergy(today.data?.energy ?? null)
      setUrgent(today.data?.urgentSubjectId ?? null)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [today.data])

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* sin almacenamiento */
    }
    setOpen(false)
  }

  const submit = async (level = energy) => {
    if (!level) return
    setSaving(true)
    try {
      await api.checkIns.create({ energy: level, urgentSubjectId: urgent })
      await qc.invalidateQueries({ queryKey: queryKeys.checkInToday })
      await qc.invalidateQueries({ queryKey: queryKeys.plan })
      setOpen(false)
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  // 1/2/3 eligen la energía; Enter confirma.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const idx = ['1', '2', '3'].indexOf(e.key)
      if (idx >= 0) setEnergy(ENERGY[idx]!.value)
      if (e.key === 'Enter' && energy) void submit()
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      key="checkin"
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6 backdrop-blur-[3px]"
      onMouseDown={dismiss}
    >
      <motion.div
        variants={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] overflow-hidden rounded-[10px] bg-surface shadow-2xl arcade:shadow-[0_0_0_1px_var(--line-strong),0_0_40px_rgb(255_43_214/0.15)]"
      >
        <div className="px-6 pt-6 pb-2 text-center">
          <h2 id="checkin-title" className="font-display text-xl font-bold arcade:text-glow arcade:text-accent">
            Check-in de hoy
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Dos preguntas, diez segundos. Con esto armamos tu plan.</p>
        </div>

        <div className="space-y-5 px-6 py-4">
          <fieldset>
            <legend className="mb-2 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">
              ¿Cómo está tu nivel de energía?
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY.map((e, i) => {
                const active = energy === e.value
                return (
                  <button
                    key={e.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setEnergy(e.value)}
                    onDoubleClick={() => void submit(e.value)}
                    className={cn(
                      'relative flex flex-col items-center gap-1 rounded-[8px] border-2 px-2 py-3 transition-colors',
                      active ? 'border-accent bg-accent-soft arcade:shadow-glow' : 'border-transparent bg-surface-2 hover:bg-hover'
                    )}
                  >
                    <e.icon size={26} className={e.tone} />
                    <span className="text-sm font-semibold">{e.label}</span>
                    <span className="text-[11px] leading-tight text-fg-muted">{e.hint}</span>
                    <kbd className="absolute top-1.5 right-2 font-mono text-[10px] text-fg-subtle">{i + 1}</kbd>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {subjects.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">
                ¿Qué materia requiere más urgencia?
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: null as string | null, name: 'Ninguna en especial', color: '' }, ...subjects].map((s) => {
                  const active = urgent === s.id
                  return (
                    <button
                      key={s.id ?? 'none'}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setUrgent(s.id)}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                        active ? 'border-accent bg-accent-soft font-medium text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
                      )}
                    >
                      {s.id && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color(s.color) }} />}
                      {s.name}
                      {active && <Check size={13} className="text-accent" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 bg-panel px-6 py-3">
          <Button variant="ghost" onClick={dismiss}>
            Ahora no
          </Button>
          <Button variant="primary" disabled={!energy || saving} onClick={() => void submit()}>
            Armar mi plan
          </Button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}
