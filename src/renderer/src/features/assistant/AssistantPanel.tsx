import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { sidePanel, spring } from '@/lib/motion'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Bot, CalendarRange, Copy, Loader2, NotebookPen, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import type { AiTask } from '@shared/validation'
import type { DocumentRecord } from '@shared/models'
import { buildReadingPlan, type ReadingPlan } from '@shared/readingPlan'
import { toLocalDate } from '@shared/domain'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { dayFmt } from '@/lib/format'
import { useUpcomingEvents } from '@/hooks/useAppData'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { KIND_LABEL } from '@/components/layout/Countdown'
import { MarkdownView } from '../workspace/editor/MarkdownView'
import type { AnchorDraft } from '../workspace/anchorDraft'

export interface AiItem {
  id: string
  task: AiTask
  draft: AnchorDraft | null
  text: string
  status: 'streaming' | 'done' | 'error'
  error?: string
  model?: string
  requestId?: string
}

export const TASK_LABEL: Record<AiTask, string> = {
  simplify: 'Explicación simple',
  summarize: 'Resumen',
  'reading-advice': 'Consejos de lectura'
}

interface Props {
  tab: 'ai' | 'plan'
  onTab: (t: 'ai' | 'plan') => void
  onClose: () => void
  items: AiItem[]
  aiReady: boolean
  onCancel: (item: AiItem) => void
  onRetry: (item: AiItem) => void
  onInsert: (item: AiItem) => void
  onDismiss: (item: AiItem) => void
  document: DocumentRecord | null
  subjectName: string | null
  onAdvice: (planJson: string) => void
}

/** Panel lateral del espacio de estudio: respuestas de la IA y plan de lectura del PDF. */
export function AssistantPanel(p: Props) {
  return (
    <motion.aside
      variants={sidePanel}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-y-0 right-0 z-30 flex w-[min(400px,92%)] flex-col border-l border-line bg-surface shadow-2xl"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        {(
          [
            ['ai', 'Asistente', Bot],
            ['plan', 'Plan de lectura', CalendarRange]
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => p.onTab(key)}
            aria-pressed={p.tab === key}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium',
              p.tab === key ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={p.onClose} aria-label="Cerrar panel" className="flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.tab === 'ai' ? <AiTab {...p} /> : <PlanTab {...p} />}
      </div>
    </motion.aside>
  )
}

function AiTab({ items, aiReady, onCancel, onRetry, onInsert, onDismiss }: Props) {
  if (!aiReady) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Activá la IA para usar el asistente"
        description="Podés usar Claude con tu API key o un modelo local con Ollama (sin enviar el texto a internet)."
        action={
          <Link to="/ajustes">
            <Button variant="primary">Ir a Ajustes</Button>
          </Link>
        }
      />
    )
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Seleccioná un párrafo difícil"
        description="Hacé clic derecho sobre texto del PDF y elegí «Simplificar» o «Resumir». La respuesta aparece acá, sin salir de la pantalla de estudio."
      />
    )
  }
  return (
    <ol className="space-y-3 p-3">
      <AnimatePresence initial={false}>
      {items.map((it) => (
        <motion.li
          key={it.id}
          layout
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={spring.sheet}
          className="overflow-hidden rounded-card border border-line bg-canvas"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
            <Sparkles size={13} className="text-accent-2" />
            <span className="font-semibold">{TASK_LABEL[it.task]}</span>
            {it.draft && <span className="text-fg-subtle">· p. {it.draft.page}</span>}
            <span className="flex-1" />
            {it.status === 'streaming' && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            <button onClick={() => onDismiss(it)} aria-label="Descartar" className="text-fg-subtle hover:text-fg">
              <X size={13} />
            </button>
          </div>
          {it.draft?.selectedText && (
            <p className="line-clamp-2 border-b border-line bg-surface-2/50 px-3 py-1.5 text-[11px] text-fg-muted italic">
              “{it.draft.selectedText}”
            </p>
          )}
          <div className="px-3 py-2">
            {it.status === 'error' ? (
              <p className="text-xs text-danger">{it.error}</p>
            ) : it.text ? (
              <MarkdownView markdown={it.text} />
            ) : (
              <p className="text-xs text-fg-subtle">Pensando…</p>
            )}
          </div>
          <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
            {it.status === 'streaming' && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(it)}>
                <Square size={11} fill="currentColor" /> Detener
              </Button>
            )}
            {it.status === 'done' && it.draft && (
              <Button size="sm" variant="ghost" onClick={() => onInsert(it)}>
                <NotebookPen size={13} /> Insertar en apunte
              </Button>
            )}
            {it.status === 'done' && (
              <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(it.text)}>
                <Copy size={13} /> Copiar
              </Button>
            )}
            {it.status === 'error' && (
              <Button size="sm" variant="ghost" onClick={() => onRetry(it)}>
                <RotateCcw size={13} /> Reintentar
              </Button>
            )}
            <span className="flex-1" />
            {it.model && <span className="truncate text-[10px] text-fg-subtle">{it.model}</span>}
          </div>
        </motion.li>
      ))}
      </AnimatePresence>
    </ol>
  )
}

const STATUS_COPY: Record<ReadingPlan['status'], { label: string; tone: string }> = {
  ok: { label: 'Alcanzable', tone: 'bg-success/15 text-success' },
  tight: { label: 'Ajustado', tone: 'bg-warning/15 text-warning' },
  done: { label: 'Terminado', tone: 'bg-success/15 text-success' },
  'no-time': { label: 'Sin días', tone: 'bg-danger/15 text-danger' }
}
const parseDay = (d: string) => new Date(`${d}T12:00:00`)

function PlanTab({ document: doc, subjectName, aiReady, onAdvice }: Props) {
  const { data: events = [] } = useUpcomingEvents()
  const docFresh = useQuery({
    queryKey: ['documents', 'byId', doc?.id, 'plan'],
    queryFn: () => api.documents.get(doc!.id),
    enabled: !!doc,
    refetchInterval: 15_000
  })
  const milestones = events.filter((e) => e.subjectId === doc?.subjectId && (e.kind === 'exam' || e.kind === 'assignment') && !e.completedAt)
  const [eventId, setEventId] = useState<string | null>(null)
  const [reviewDay, setReviewDay] = useState(true)
  const [restSunday, setRestSunday] = useState(false)
  const target = milestones.find((m) => m.id === eventId) ?? milestones[0]
  const d = docFresh.data ?? doc
  const today = toLocalDate()

  const plan = useMemo(
    () =>
      d && target
        ? buildReadingPlan({
            pageCount: d.pageCount,
            pagesRead: d.maxPageRead,
            today,
            examDate: toLocalDate(target.startsAt),
            reviewDays: reviewDay ? 1 : 0,
            restWeekdays: restSunday ? [6] : []
          })
        : null,
    [d, target, today, reviewDay, restSunday]
  )

  if (!d) return <EmptyState icon={CalendarRange} title="Abrí un PDF" description="El plan reparte las páginas que faltan hasta tu próximo parcial." />
  if (!target)
    return (
      <EmptyState
        icon={CalendarRange}
        title="Sin parciales para esta materia"
        description="Cargá la fecha del parcial o la entrega en Calendario y el plan se arma solo."
        action={
          <Link to={`/calendario?subject=${d.subjectId}`}>
            <Button variant="secondary">Cargar fecha</Button>
          </Link>
        }
      />
    )

  const st = plan ? STATUS_COPY[plan.status] : null
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="space-y-2">
        <select
          aria-label="Hito"
          value={target.id}
          onChange={(e) => setEventId(e.target.value)}
          className="h-8 w-full rounded-card border border-line bg-canvas px-2 text-xs focus:border-accent focus:outline-none"
        >
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {KIND_LABEL[m.kind]}: {m.title} · {dayFmt.format(m.startsAt)}
            </option>
          ))}
        </select>
        <div className="flex gap-4 text-xs text-fg-muted">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={reviewDay} onChange={(e) => setReviewDay(e.target.checked)} className="accent-[var(--accent)]" />
            Día previo para repasar
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={restSunday} onChange={(e) => setRestSunday(e.target.checked)} className="accent-[var(--accent)]" />
            Domingos libres
          </label>
        </div>
      </div>

      {plan && st && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure label="Páginas restantes" value={plan.remainingPages} />
            <Figure label="Días de lectura" value={plan.studyDays} />
            <Figure label="Por sesión" value={plan.pagesPerSession} strong />
          </div>
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', st.tone)}>{st.label}</span>
            {plan.status === 'tight' && 'Más de 40 páginas por sesión: priorizá los temas centrales.'}
            {plan.status === 'no-time' && 'No quedan días de lectura antes del hito.'}
            {plan.status === 'done' && '¡Ya leíste todo el documento!'}
            {plan.status === 'ok' && `Leíste hasta la pág. ${d.maxPageRead} de ${d.pageCount}.`}
          </p>

          {plan.sessions.length > 0 && (
            <ol className="divide-y divide-line rounded-card border border-line">
              {plan.sessions.map((s) => (
                <li key={s.date} className={cn('flex items-center justify-between px-3 py-1.5 text-xs', s.date === today && 'bg-accent-soft font-semibold')}>
                  <span>{s.date === today ? 'Hoy' : dayFmt.format(parseDay(s.date))}</span>
                  <span className="tabular-nums">
                    págs. {s.pageFrom}–{s.pageTo} <span className="text-fg-subtle">({s.pageTo - s.pageFrom + 1})</span>
                  </span>
                </li>
              ))}
              {plan.reviewFrom && (
                <li className="flex items-center justify-between px-3 py-1.5 text-xs text-fg-muted">
                  <span>{dayFmt.format(parseDay(plan.reviewFrom))}</span>
                  <span>Repaso general</span>
                </li>
              )}
            </ol>
          )}

          {aiReady && plan.status !== 'done' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                onAdvice(
                  JSON.stringify(
                    {
                      documento: d.title,
                      materia: subjectName,
                      hito: `${KIND_LABEL[target.kind]}: ${target.title}`,
                      estado: plan.status,
                      paginasRestantes: plan.remainingPages,
                      diasDeLectura: plan.studyDays,
                      paginasPorSesion: plan.pagesPerSession,
                      diaDeRepaso: plan.reviewFrom,
                      sesiones: plan.sessions
                    },
                    null,
                    1
                  )
                )
              }
            >
              <Sparkles size={13} /> Pedir consejos a la IA
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-card bg-surface-2 px-2 py-2">
      <p className={cn('text-xl font-semibold', strong && 'text-accent arcade:text-glow')}>{value}</p>
      <p className="text-[10px] leading-tight text-fg-muted">{label}</p>
    </div>
  )
}
