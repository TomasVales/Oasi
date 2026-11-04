import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toLocalDate } from '@shared/domain'
import { addDays, parseLocalDate } from '@shared/dates'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { dialog, fade } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { useSubjects } from '@/hooks/useSubjects'
import { Button } from '@/components/ui/Button'

const PRESETS = [15, 30, 45, 60, 90, 120]
const DAYS = [
  { offset: 0, label: 'Hoy' },
  { offset: -1, label: 'Ayer' },
  { offset: -2, label: 'Anteayer' }
]

const pad = (n: number) => String(n).padStart(2, '0')
const nowHHMM = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * "Estudié sin la app": carga una sesión ya terminada (materia, duración y cuándo terminó).
 * Suma al heatmap, a la racha y a las estadísticas como cualquier otra sesión.
 */
export function LogStudyDialog({ defaultSubjectId, onClose }: { defaultSubjectId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: subjects } = useSubjects()
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? '')
  const [minutes, setMinutes] = useState(60)
  const [dayOffset, setDayOffset] = useState(0)
  const [endTime, setEndTime] = useState(nowHHMM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const firstRef = useRef<HTMLButtonElement>(null)
  useEffect(() => firstRef.current?.focus(), [])

  const endedAt = (() => {
    const [h, m] = endTime.split(':').map(Number)
    const day = new Date(parseLocalDate(addDays(toLocalDate(), dayOffset)))
    // parseLocalDate da la medianoche UTC del día: se arma la fecha local con sus componentes.
    return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h ?? 0, m ?? 0).getTime()
  })()
  const future = endedAt > Date.now() + 60_000
  const startLabel = new Date(endedAt - minutes * 60_000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const valid = minutes >= 1 && minutes <= 720 && !future

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      await api.sessions.log({ subjectId: subjectId || null, minutes, endedAt })
      void qc.invalidateQueries({ queryKey: queryKeys.stats })
      void qc.invalidateQueries({ queryKey: queryKeys.plan })
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <motion.form
        variants={dialog}
        role="dialog"
        aria-label="Registrar estudio sin la app"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        style={{ backgroundColor: 'var(--surface)' }}
        className="w-[400px] space-y-4 rounded-[12px] border border-line p-5 shadow-2xl"
      >
        <div>
          <h2 className="font-display text-base font-semibold">Registrar estudio</h2>
          <p className="text-xs text-fg-muted">¿Estudiaste sin abrir la app? Cargalo y suma a tu racha y estadísticas.</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Materia</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 rounded-card border border-line bg-canvas px-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Sin materia (sesión libre)</option>
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-labelledby="log-minutes" className="flex flex-col gap-1.5">
          <span id="log-minutes" className="text-xs font-medium text-fg-muted">
            ¿Cuánto tiempo?
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((m, i) => (
              <button
                key={m}
                ref={i === 3 ? firstRef : undefined}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium',
                  minutes === m ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
                )}
              >
                {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="number"
                min={1}
                max={720}
                value={minutes}
                aria-label="Minutos"
                onChange={(e) => setMinutes(Math.max(0, Math.min(720, Math.round(Number(e.target.value) || 0))))}
                className="h-8 w-16 rounded-card border border-line bg-canvas px-2 text-sm text-fg tabular-nums focus:border-accent focus:outline-none"
              />
              min
            </label>
          </div>
        </div>

        <div role="group" aria-labelledby="log-when" className="flex flex-col gap-1.5">
          <span id="log-when" className="text-xs font-medium text-fg-muted">
            ¿Cuándo terminaste?
          </span>
          <div className="flex items-center gap-1.5">
            <div role="radiogroup" aria-label="Día" className="flex rounded-card bg-surface-2 p-1">
              {DAYS.map((d) => (
                <button
                  key={d.offset}
                  type="button"
                  role="radio"
                  aria-checked={dayOffset === d.offset}
                  onClick={() => setDayOffset(d.offset)}
                  className={cn(
                    'h-7 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium',
                    dayOffset === d.offset ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <input
              type="time"
              aria-label="Hora en que terminaste"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value || nowHHMM())}
              className="h-9 rounded-card border border-line bg-canvas px-2 text-sm text-fg tabular-nums focus:border-accent focus:outline-none"
            />
          </div>
          <span className={cn('text-[11px]', future ? 'text-danger' : 'text-fg-subtle')}>
            {future ? 'Esa hora todavía no pasó.' : `De ${startLabel} a ${endTime}.`}
          </span>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={!valid || saving}>
            {saving ? 'Guardando…' : 'Registrar'}
          </Button>
        </div>
      </motion.form>
    </motion.div>
  )
}
