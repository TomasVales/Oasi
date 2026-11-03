import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  closestCenter,
  pointerWithin,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { Check, EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw } from 'lucide-react'
import { moveWidget, normalizeDashboard } from '@shared/dashboard'
import { DEFAULT_SETTINGS, type AppSettings, type DashboardSettings, type DashboardWidget } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { longDayFmt } from '@/lib/format'
import { spring } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Button } from '@/components/ui/Button'
import { WIDGETS } from './widgets'

function greeting(d = new Date()) {
  const h = d.getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buen día'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * El destino es el widget bajo el puntero (intuitivo con widgets de distinto ancho);
 * si el puntero cae en un hueco, o se usa el teclado, el de centro más cercano.
 */
const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length ? under : closestCenter(args)
}

/**
 * Los widgets tienen anchos distintos (1–3 columnas): desplazarlos durante el arrastre
 * deforma la grilla. Quedan quietos; el destino se resalta y el orden cambia al soltar.
 */
const staticStrategy: SortingStrategy = () => null

const SPAN: Record<1 | 2 | 3, string> = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3' }

/** Inicio como dashboard modular: widgets reordenables (arrastrar o teclado) y ocultables. */
export function DashboardPage() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const layout = normalizeDashboard(settings?.dashboard)
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState<DashboardWidget | null>(null)
  const visible = layout.order.filter((id) => !layout.hidden.includes(id))
  const name = settings?.profile.name.trim()
  const today = longDayFmt.format(new Date())

  const save = (next: DashboardSettings) => {
    // Optimista: el cambio se ve al instante; la DB se actualiza por detrás.
    qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, dashboard: next } : s))
    void api.settings.set('dashboard', next)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.id as DashboardWidget)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (e.over && e.active.id !== e.over.id)
      save({ ...layout, order: moveWidget(layout.order, e.active.id as DashboardWidget, e.over.id as DashboardWidget) })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-7">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight arcade:text-glow arcade:text-accent">
              {greeting()}
              {name ? `, ${name}` : ''}
            </h1>
            <p className="text-sm text-fg-muted">{today.charAt(0).toUpperCase() + today.slice(1)}</p>
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <Button size="sm" variant="ghost" onClick={() => save(DEFAULT_SETTINGS.dashboard)}>
                <RotateCcw size={13} /> Restablecer
              </Button>
            )}
            <Button size="sm" variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((v) => !v)}>
              {editing ? <Check size={14} /> : <LayoutGrid size={14} />}
              {editing ? 'Listo' : 'Personalizar'}
            </Button>
          </div>
        </header>

        <AnimatePresence>
          {editing && layout.hidden.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.sheet}
              className="overflow-hidden"
            >
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-dashed border-line-strong p-3 text-xs">
                <span className="text-fg-muted">Widgets ocultos:</span>
                {layout.hidden.map((id) => (
                  <button
                    key={id}
                    onClick={() => save({ ...layout, hidden: layout.hidden.filter((h) => h !== id) })}
                    className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-fg hover:bg-hover"
                  >
                    <Plus size={12} /> {WIDGETS[id].title}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {editing && <p className="mb-3 text-xs text-fg-subtle">Arrastrá los widgets desde su manija (o enfocala y usá las flechas + espacio) para reordenarlos.</p>}

        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <SortableContext items={visible} strategy={staticStrategy}>
            <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-3">
              {visible.map((id) => (
                <SortableWidget
                  key={id}
                  id={id}
                  editing={editing}
                  onHide={() => save({ ...layout, hidden: [...layout.hidden, id] })}
                />
              ))}
            </div>
          </SortableContext>
          {/* Copia flotante mientras se arrastra: "se levanta" con sombra y leve escala.
              Va en un portal: un ancestro con transform (animación de pantalla) la recortaría. */}
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }}>
              {dragging && <DragChip id={dragging} />}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>
    </div>
  )
}

/**
 * Representación compacta mientras se arrastra (como el "proxy" de arrastre de macOS).
 * El overlay mide lo mismo que el widget; la ficha va arriba a la derecha, donde está
 * la manija, así queda bajo el cursor sin importar el ancho del widget.
 */
function DragChip({ id }: { id: DashboardWidget }) {
  const w = WIDGETS[id]
  return (
    <div className="pointer-events-none flex h-full w-full items-start justify-end p-1.5">
      <div className="flex -rotate-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-2xl ring-1 ring-accent/40 arcade:shadow-glow">
        <w.icon size={15} className="text-accent" />
        {w.title}
        <GripVertical size={14} className="text-fg-subtle" />
      </div>
    </div>
  )
}

function SortableWidget({ id, editing, onHide }: { id: DashboardWidget; editing: boolean; onHide: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver, active } = useSortable({ id })
  const isTarget = isOver && active?.id !== id
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-card transition-[opacity,box-shadow] duration-200',
        SPAN[WIDGETS[id].span],
        isDragging && 'opacity-30',
        isTarget && 'ring-2 ring-accent ring-offset-4 ring-offset-canvas'
      )}
    >
      <WidgetFrame
        id={id}
        editing={editing}
        onHide={onHide}
        handle={
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Mover ${WIDGETS[id].title}`}
            className={cn(
              'flex h-6 w-6 cursor-grab items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg active:cursor-grabbing',
              !editing && 'opacity-0 group-hover/widget:opacity-100 focus-visible:opacity-100'
            )}
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </div>
  )
}

function WidgetFrame({
  id,
  editing,
  handle,
  onHide
}: {
  id: DashboardWidget
  editing: boolean
  handle?: React.ReactNode
  onHide?: () => void
}) {
  const w = WIDGETS[id]
  const Body = w.Body
  return (
    <section
      aria-label={w.title}
      className={cn(
        'group/widget flex h-full flex-col rounded-card border border-line bg-surface shadow-card transition-shadow',
        editing && 'border-dashed border-line-strong'
      )}
    >
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <w.icon size={13} className="text-fg-subtle arcade:text-accent-2" />
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-fg-muted uppercase arcade:text-accent-2">{w.title}</h2>
        {editing && onHide && (
          <button onClick={onHide} aria-label={`Ocultar ${w.title}`} title="Ocultar" className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg">
            <EyeOff size={13} />
          </button>
        )}
        {handle ?? <GripVertical size={14} className="text-fg-subtle" />}
      </header>
      <div className="min-h-0 flex-1 px-4 pb-4">
        <Body />
      </div>
    </section>
  )
}
