import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcError'
import { dialog, fade } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { Button } from '@/components/ui/Button'
import { useSession, type FinishedSession } from './SessionProvider'

/** 1–5 → se guarda como 0–1 en `focusScore`. */
export const FOCUS_LEVELS = [
  { value: 0, emoji: '😵', label: 'Nada' },
  { value: 0.25, emoji: '😕', label: 'Poco' },
  { value: 0.5, emoji: '😐', label: 'Más o menos' },
  { value: 0.75, emoji: '🙂', label: 'Bien' },
  { value: 1, emoji: '🔥', label: 'A full' }
]

export const focusLevel = (score: number | null) =>
  score === null ? null : FOCUS_LEVELS.reduce((a, b) => (Math.abs(b.value - score) < Math.abs(a.value - score) ? b : a))

/** Al terminar una sesión (de 5 min o más): "¿qué tan concentrado estuviste?" y hasta qué página llegaste. */
export function SessionReflection() {
  const { finished, clearFinished } = useSession()
  return <AnimatePresence>{finished && <ReflectionDialog key={finished.id} finished={finished} onClose={clearFinished} />}</AnimatePresence>
}

function ReflectionDialog({ finished, onClose }: { finished: FinishedSession; onClose: () => void }) {
  const qc = useQueryClient()
  const [score, setScore] = useState<number | null>(null)
  const [page, setPage] = useState<string>(finished.pagesTo ? String(finished.pagesTo) : '')
  const [error, setError] = useState<string | null>(null)
  const doc = useQuery({
    queryKey: ['document', finished.documentId],
    queryFn: () => api.documents.get(finished.documentId!),
    enabled: !!finished.documentId
  })
  const pageNum = Number(page)
  const pageValid = page === '' || (Number.isInteger(pageNum) && pageNum >= 1 && (!doc.data || pageNum <= doc.data.pageCount))

  const save = async () => {
    if (!pageValid) return
    try {
      await api.sessions.update(finished.id, {
        focusScore: score,
        ...(finished.documentId ? { pagesTo: page === '' ? null : pageNum } : {})
      })
      void qc.invalidateQueries({ queryKey: queryKeys.stats })
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err))
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
        aria-label="¿Cómo te fue?"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          const n = Number(e.key)
          if (n >= 1 && n <= 5 && !(e.target instanceof HTMLInputElement)) setScore(FOCUS_LEVELS[n - 1]!.value)
        }}
        style={{ backgroundColor: 'var(--surface)' }}
        className="w-[420px] space-y-4 rounded-[12px] border border-line p-5 shadow-2xl"
      >
        <div>
          <h2 className="font-display text-base font-semibold">¡Listo! {formatDuration(finished.activeSeconds)} de foco</h2>
          <p className="text-xs text-fg-muted">¿Qué tan concentrado estuviste? Sirve para ver en qué horarios rendís mejor.</p>
        </div>

        <div role="radiogroup" aria-label="Nivel de concentración" className="grid grid-cols-5 gap-1.5">
          {FOCUS_LEVELS.map((l, i) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={score === l.value}
              autoFocus={i === 3}
              title={`${l.label} (${i + 1})`}
              onClick={() => setScore(l.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-card border py-2 text-[11px]',
                score === l.value ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
              )}
            >
              <span className="text-xl leading-none" aria-hidden>
                {l.emoji}
              </span>
              {l.label}
            </button>
          ))}
        </div>

        {finished.documentId && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              ¿Hasta qué página llegaste?
              {doc.data && <span className="block truncate text-[11px] text-fg-subtle">{doc.data.title} · {doc.data.pageCount} págs.</span>}
            </span>
            <input
              type="number"
              min={1}
              max={doc.data?.pageCount}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              aria-invalid={!pageValid}
              className={cn(
                'h-9 w-20 rounded-card border bg-canvas px-2 text-center text-sm tabular-nums focus:outline-none',
                pageValid ? 'border-line focus:border-accent' : 'border-danger'
              )}
            />
          </label>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Saltar
          </Button>
          <Button variant="primary" type="submit" disabled={!pageValid || (score === null && !finished.documentId)}>
            Guardar
          </Button>
        </div>
      </motion.form>
    </motion.div>
  )
}
