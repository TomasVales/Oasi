import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { GraduationCap, Layers, NotebookPen, PartyPopper, RotateCcw } from 'lucide-react'
import { GRADES, intervalLabel, type Grade } from '@shared/flashcards'
import type { Flashcard } from '@shared/models'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MarkdownView } from '@/features/workspace/editor/MarkdownView'

export const flashcardsKey = (subjectId: string | null) => ['flashcards', subjectId] as const

const GRADE_META: Record<Grade, { label: string; key: string; tone: string }> = {
  again: { label: 'Otra vez', key: '1', tone: 'border-danger/40 text-danger hover:bg-danger/10' },
  hard: { label: 'Difícil', key: '2', tone: 'border-warning/40 text-warning hover:bg-warning/10' },
  good: { label: 'Bien', key: '3', tone: 'border-success/40 text-success hover:bg-success/10' },
  easy: { label: 'Fácil', key: '4', tone: 'border-accent/40 text-accent hover:bg-accent-soft' }
}

/**
 * Repaso con repetición espaciada. Las tarjetas salen de los apuntes (líneas
 * "pregunta :: respuesta"); primero las de materias con parcial cerca.
 */
export function ReviewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const subjectId = params.get('subject')
  const qc = useQueryClient()
  const { data: subjects = [] } = useSubjects()
  const color = useSubjectColor()
  const deck = useQuery({ queryKey: flashcardsKey(subjectId), queryFn: () => api.flashcards.deck(subjectId), staleTime: 0 }) // los apuntes cambian sin avisar

  // La cola se congela al empezar: repasar no reordena lo que falta. "Otra vez" la manda al final.
  const [queue, setQueue] = useState<Flashcard[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setQueue(null)
    setDone(0)
  }, [subjectId])
  useEffect(() => {
    if (queue === null && deck.data) setQueue(deck.data.due)
  }, [deck.data, queue])

  const card = queue?.[0]
  const subject = subjects.find((s) => s.id === card?.subjectId)

  const grade = useCallback(
    async (g: Grade) => {
      if (!card) return
      setError(null)
      try {
        await api.flashcards.review({ id: card.id, noteId: card.noteId, grade: g })
      } catch (err) {
        setError(ipcErrorMessage(err))
        return
      }
      setRevealed(false)
      setQueue((q) => (q ? (g === 'again' ? [...q.slice(1), { ...q[0]!, isNew: false }] : q.slice(1)) : q))
      if (g !== 'again') setDone((d) => d + 1)
    },
    [card]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !card) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed) {
        const g = GRADES.find((x) => GRADE_META[x].key === e.key)
        if (g) {
          e.preventDefault()
          void grade(g)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, grade])

  const restart = () => {
    setQueue(null)
    setDone(0)
    void qc.invalidateQueries({ queryKey: ['flashcards'] })
  }

  const remaining = queue?.length ?? 0
  const progress = done + remaining ? done / (done + remaining) : 0
  const bySubject = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of deck.data?.due ?? []) m.set(c.subjectId, (m.get(c.subjectId) ?? 0) + 1)
    return m
  }, [deck.data])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-8 py-7">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Materia"
            value={subjectId ?? ''}
            onChange={(e) => navigate(e.target.value ? `/repaso?subject=${e.target.value}` : '/repaso')}
            className="h-9 rounded-card border border-line bg-surface px-2 text-xs focus:border-accent focus:outline-none"
          >
            <option value="">Todas las materias</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {bySubject.get(s.id) ? ` (${bySubject.get(s.id)})` : ''}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          {deck.data && (
            <span className="text-xs text-fg-muted">
              {deck.data.total} tarjetas en tus apuntes · {deck.data.due.length} para hoy
              {deck.data.newCount ? ` (${deck.data.newCount} nuevas)` : ''}
            </span>
          )}
        </div>

        {deck.data && deck.data.total === 0 ? (
          <HowTo />
        ) : card ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Progreso del repaso" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={card.id + String(done) + remaining} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                <Card className="p-6">
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    {subject && <span className="h-2 w-2 rounded-full" style={{ background: color(subject.color) }} />}
                    <span className="font-medium text-fg">{card.subjectName}</span>
                    <Link to={`/estudio?subject=${card.subjectId}&note=${card.noteId}`} className="flex items-center gap-1 hover:text-fg hover:underline">
                      <NotebookPen size={12} /> {card.noteTitle}
                    </Link>
                    {card.isNew && <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">nueva</span>}
                    <span className="flex-1" />
                    {card.examInDays !== null && card.examInDays <= 14 && (
                      <span className="flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 font-semibold text-danger">
                        <GraduationCap size={12} />
                        Parcial {card.examInDays === 0 ? 'hoy' : card.examInDays === 1 ? 'mañana' : `en ${card.examInDays} días`}
                      </span>
                    )}
                  </div>
                  <MarkdownView markdown={card.front} className="text-xl font-medium" />
                  {revealed ? (
                    <div className="mt-5 border-t border-line pt-5">
                      <MarkdownView markdown={card.back} className="text-base" />
                    </div>
                  ) : (
                    <Button variant="secondary" className="mt-6 w-full justify-center" onClick={() => setRevealed(true)}>
                      Mostrar respuesta <kbd className="ml-1 text-[10px] text-fg-subtle">Espacio</kbd>
                    </Button>
                  )}
                </Card>
              </motion.div>
            </AnimatePresence>
            {revealed && (
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="¿Qué tan bien te la sabías?">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => void grade(g)}
                    className={cn('flex flex-col items-center gap-0.5 rounded-card border bg-surface py-2.5 text-sm font-medium', GRADE_META[g].tone)}
                  >
                    {GRADE_META[g].label}
                    <span className="text-[11px] font-normal text-fg-subtle">
                      {intervalLabel(card.schedule, g, card.examInDays)} · {GRADE_META[g].key}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
            <p className="text-center text-xs text-fg-subtle">
              Quedan {remaining} · repasadas {done}
            </p>
          </>
        ) : queue ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <PartyPopper size={28} className="text-accent" />
            <p className="font-display text-lg font-semibold">{done ? `¡Listo! Repasaste ${done} tarjetas` : 'No hay nada para repasar ahora'}</p>
            <p className="text-sm text-fg-muted">Las próximas aparecen cuando toque repasarlas. Si agregás tarjetas nuevas en tus apuntes, salen acá.</p>
            <Button variant="ghost" size="sm" onClick={restart}>
              <RotateCcw size={13} /> Buscar de nuevo
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function HowTo() {
  return (
    <Card className="space-y-3 p-6">
      <div className="flex items-center gap-2">
        <Layers size={18} className="text-accent" />
        <h2 className="font-display text-base font-semibold">Armá tarjetas desde tus apuntes</h2>
      </div>
      <p className="text-sm text-fg-muted">
        En cualquier apunte, escribí una pregunta y su respuesta en la misma línea, separadas por <code className="rounded bg-surface-2 px-1">::</code>
      </p>
      <pre className="selectable overflow-x-auto rounded-card bg-surface-2 p-3 text-xs">
        {'¿Qué dice el teorema de Bolzano? :: Si f es continua en [a,b] y f(a)·f(b) < 0, tiene una raíz en (a,b)\n- Derivada de sen(x) :: cos(x)'}
      </pre>
      <p className="text-sm text-fg-muted">
        Cada tarjeta vuelve a aparecer cuando estás por olvidarla: más seguido si te cuesta, más espaciado si la sabés. Si cargaste un parcial de la materia,
        todas vuelven antes de la fecha.
      </p>
    </Card>
  )
}
