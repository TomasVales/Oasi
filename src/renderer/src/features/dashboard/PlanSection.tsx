import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/lib/api'
import { ipcErrorMessage } from '@/lib/ipcError'
import { spring } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { PanicDialog } from './PanicDialog'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, BatteryFull, BatteryLow, BatteryMedium, CalendarClock, Check, FileText, Library, Play, RefreshCcw, Zap } from 'lucide-react'
import type { EnergyLevel } from '@shared/domain'
import { studyModeLabel, type PlannedBlock } from '@shared/planner'
import type { BlockProgress } from '@shared/planProgress'
import type { PlanResponse } from '@shared/ipc'
import { cn } from '@/lib/cn'
import { timeFmt } from '@/lib/format'
import { useCheckInToday, usePlan } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { openCheckIn } from '@/features/checkin/CheckInModal'
import { useSession } from '@/features/session/SessionProvider'

export function greeting(d = new Date()) {
  const h = d.getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buen día'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

const ENERGY_META: Record<EnergyLevel, { label: string; icon: typeof BatteryFull; tone: string }> = {
  low: { label: 'Energía baja', icon: BatteryLow, tone: 'text-danger' },
  medium: { label: 'Energía media', icon: BatteryMedium, tone: 'text-warning' },
  high: { label: 'Energía alta', icon: BatteryFull, tone: 'text-success' }
}

// ─── Plan de ahora ──────────────────────────────────────────────────────────
/** Próxima mañana a las 9:00 (de madrugada, la de HOY: todavía no amaneció). */
function nextMorningAt9(): Date {
  const d = new Date()
  if (d.getHours() >= 6) d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

export function PlanSection() {
  const checkIn = useCheckInToday()
  const [planAt, setPlanAt] = useState<Date | null>(null)
  const plan = usePlan(planAt)
  const { data: subjects } = useSubjects()
  const qc = useQueryClient()
  const [panic, setPanic] = useState(false)
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const recalc = async (opts: { energy: EnergyLevel; recover: boolean }) => {
    setRecalcBusy(true)
    try {
      const next = await api.planner.recalculate(opts)
      // Se muestra al instante; el resto (check-in, racha) se refresca por detrás.
      qc.setQueryData<PlanResponse>([...queryKeys.plan, 'now'], next)
      void qc.invalidateQueries({ queryKey: queryKeys.checkInToday })
      setPanic(false)
      const first = next.blocks[0]
      setNotice(
        first
          ? `Plan recalculado: ${next.blocks.length} ${next.blocks.length === 1 ? 'bloque' : 'bloques'} desde las ${timeFmt.format(first.start)}`
          : 'No queda tiempo hoy para bloques nuevos'
      )
      window.setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setNotice(`No se pudo recalcular: ${ipcErrorMessage(err)}`)
    } finally {
      setRecalcBusy(false)
    }
  }

  if (subjects && subjects.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Library}
          title="Cargá tus materias para empezar"
          description="Con tus materias y las fechas de parciales, el planificador te sugiere qué estudiar en cada momento."
          action={
            <Link to="/materias?nueva=1">
              <Button variant="primary">Nueva materia</Button>
            </Link>
          }
        />
      </Card>
    )
  }

  if (checkIn.isSuccess && !checkIn.data) {
    return (
      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Zap size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">¿Arrancamos?</p>
          <p className="text-sm text-fg-muted">Contanos cómo está tu energía y armamos el plan óptimo para ahora.</p>
        </div>
        <Button variant="primary" onClick={openCheckIn}>
          Hacer check-in
        </Button>
      </Card>
    )
  }

  const data = plan.data
  const energy = data ? ENERGY_META[data.energy] : null
  const urgent = subjects?.find((s) => s.id === data?.urgentSubjectId)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {planAt && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">Plan para la mañana</span>}
        {planAt && (
          <button onClick={() => setPlanAt(null)} className="text-xs text-accent hover:underline">
            Volver a hoy
          </button>
        )}
        {energy && (
          <button
            onClick={openCheckIn}
            title="Cambiar check-in"
            className="flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs text-fg-muted hover:bg-hover hover:text-fg"
          >
            <energy.icon size={14} className={energy.tone} /> {energy.label}
          </button>
        )}
        {urgent && (
          <span className="flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs text-fg-muted">
            Urgente: <strong className="font-medium text-fg">{urgent.name}</strong>
          </span>
        )}
        <span className="flex-1" />
        {!planAt && data && (data.blocks.length > 0 || data.freeMinutes >= 15) && (
          <Button size="sm" variant="ghost" onClick={() => setPanic(true)} title="Rearmar el resto del día desde ahora">
            <RefreshCcw size={13} /> Recalcular
          </Button>
        )}
      </div>

      {data?.snapshot && !planAt && (
        <p className="text-[11px] text-fg-subtle">
          {data.snapshot.reason === 'panic' ? 'Recalculado' : 'Armado'} a las {timeFmt.format(data.snapshot.createdAt)}
          {data.snapshot.reason === 'checkin' ? ' con tu check-in' : ''}
        </p>
      )}

      <AnimatePresence>
        {!planAt && data?.behind && data.behind.blocks > 0 && (
          <motion.div
            key="behind"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.sheet}
            className="overflow-hidden"
          >
            <div role="alert" className="flex items-center gap-3 rounded-card border border-warning/40 bg-warning/10 px-3.5 py-2.5">
              <AlertTriangle size={17} className="shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-sm">
                <strong className="font-semibold">Vas atrasado:</strong> {data.behind.blocks} {data.behind.blocks === 1 ? 'bloque' : 'bloques'} ·{' '}
                {data.behind.minutes} min sin hacer.
              </p>
              <Button size="sm" variant="primary" onClick={() => setPanic(true)}>
                Me atrasé — recalcular
              </Button>
            </div>
          </motion.div>
        )}
        {notice && (
          <motion.p
            key="notice"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="text-xs font-medium text-success"
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panic && data && (
          <PanicDialog
            key="panic"
            energy={data.energy}
            behindMinutes={data.behind?.minutes ?? 0}
            busy={recalcBusy}
            onClose={() => setPanic(false)}
            onConfirm={(o) => void recalc(o)}
          />
        )}
      </AnimatePresence>

      {data && data.blocks.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={data.freeMinutes < 15 ? 'Es hora de descansar' : 'Nada para sugerir'}
            description={
              data.freeMinutes < 15
                ? 'Entre las 23 h y las 6 h no se planifican bloques: dormir bien también es estudiar. Igual podés iniciar una sesión libre desde tu panel.'
                : 'Cargá fechas de parciales y entregas en Calendario para priorizar mejor.'
            }
            action={
              data.freeMinutes < 15 && !planAt ? (
                <Button variant="secondary" onClick={() => setPlanAt(nextMorningAt9())}>
                  Planificar la mañana
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ol className="space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {data?.blocks.map((b, i) => (
              <PlanBlockCard
                key={`${b.subjectId}-${b.start.getTime()}`}
                block={b}
                index={i}
                future={!!planAt}
                progress={data.progress?.[i]}
                firstPending={!planAt && i === (data.progress ? data.progress.findIndex((p) => p.status === 'current' || p.status === 'upcoming') : 0)}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}
      {data?.nextBusy && (
        <p className="text-xs text-fg-subtle">
          El plan respeta tu próxima clase: {data.nextBusy.title} a las {timeFmt.format(data.nextBusy.startsAt)}.
        </p>
      )}
    </section>
  )
}

function LoadMeter({ load }: { load: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`Carga cognitiva ${load}/5`} aria-label={`Carga cognitiva ${load} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-2.5 w-1 rounded-full', i <= load ? 'bg-fg-muted' : 'bg-surface-2')} />
      ))}
    </span>
  )
}

const STATUS_BADGE: Record<BlockProgress['status'], { label: string; className: string } | null> = {
  done: { label: 'Hecho', className: 'bg-success/15 text-success' },
  missed: { label: 'Atrasado', className: 'bg-warning/15 text-warning' },
  current: { label: 'Ahora', className: 'bg-accent text-accent-fg' },
  upcoming: null
}

function PlanBlockCard({
  block: b,
  future,
  progress,
  firstPending
}: {
  block: PlannedBlock
  index: number
  future: boolean
  progress?: BlockProgress
  firstPending: boolean
}) {
  const navigate = useNavigate()
  const { session, start } = useSession()
  const { data: subjects } = useSubjects()
  const color = useSubjectColor()
  const subject = subjects?.find((s) => s.id === b.subjectId)
  const c = subject ? color(subject.color) : 'var(--accent)'
  const status = progress?.status ?? (future ? 'upcoming' : firstPending ? 'current' : 'upcoming')
  const isNow = !future && (status === 'current' || (firstPending && status === 'upcoming'))
  const badge = future ? null : status === 'upcoming' && isNow ? STATUS_BADGE.current : STATUS_BADGE[status]
  const running = session?.subjectId === b.subjectId
  const finished = status === 'done'

  const begin = async () => {
    await start({
      subjectId: b.subjectId,
      plannedMinutes: b.minutes,
      mode: b.mode,
      documentId: b.document?.id ?? null,
      eventId: b.milestone?.id ?? null,
      pagesFrom: b.document?.pageFrom ?? null
    })
    navigate(`/estudio?subject=${b.subjectId}${b.document ? `&doc=${b.document.id}` : ''}`)
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={spring.layout}
    >
      <Card
        className={cn(
          'relative flex gap-4 overflow-hidden p-4 transition-opacity',
          isNow && 'arcade:shadow-[0_0_0_1px_var(--accent),0_0_24px_rgb(57_255_20/0.12)]',
          finished && 'opacity-60',
          status === 'missed' && 'border-dashed border-warning/50'
        )}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: c }} />
        <div className="w-16 shrink-0 pl-1 text-center">
          <p className="font-mono text-sm font-semibold tabular-nums">{timeFmt.format(b.start)}</p>
          <p className="text-[11px] text-fg-subtle tabular-nums">{b.minutes} min</p>
          {badge && (
            <span className={cn('mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold uppercase', badge.className)}>
              {status === 'done' && <Check size={10} strokeWidth={3} />}
              {badge.label}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{subject?.name ?? 'Materia'}</span>
            <span className="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">{studyModeLabel(b.mode)}</span>
            <LoadMeter load={b.load} />
          </div>
          {status === 'missed' && progress && (
            <p className="text-xs font-medium text-warning">
              Faltaron {progress.debtMinutes} min{progress.doneMinutes > 0 ? ` (hiciste ${progress.doneMinutes})` : ''}
            </p>
          )}
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
            {b.reasons.map((r) => (
              <li key={r} className="before:mr-1.5 before:text-fg-subtle before:content-['•'] first:before:hidden">
                {r}
              </li>
            ))}
          </ul>
          {b.document && (
            <p className="flex items-center gap-1.5 text-xs text-fg">
              <FileText size={13} className="text-fg-subtle" />
              {b.document.title} · págs. {b.document.pageFrom}–{b.document.pageTo}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          {!finished && status !== 'missed' && (
            <Button variant={isNow ? 'primary' : 'secondary'} size="sm" onClick={() => void begin()} disabled={running}>
              <Play size={13} /> {running ? 'En curso' : 'Empezar'}
            </Button>
          )}
        </div>
      </Card>
    </motion.li>
  )
}

