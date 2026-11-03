import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, Library, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Subject } from '@shared/models'
import { nextSubjectColor, SUBJECT_PALETTE } from '@shared/subjectColors'
import { useSearchParams } from 'react-router'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import type { SubjectCreateInput } from '@shared/validation'
import { useSubjectMutations, useSubjects } from '@/hooks/useSubjects'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'



const DIFFICULTY_LABELS = ['', 'Muy liviana', 'Liviana', 'Media', 'Exigente', 'Muy exigente']

export function SubjectsPage() {
  const [params, setParams] = useSearchParams()
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreatingState] = useState(params.get('nueva') === '1')
  const setCreating = (v: boolean) => {
    setCreatingState(v)
    if (!v && params.has('nueva')) setParams({}, { replace: true })
  }
  const [editingId, setEditingId] = useState<string | null>(null)
  const { data: subjects = [], isLoading } = useSubjects(showArchived)
  const m = useSubjectMutations()

  const active = subjects.filter((s) => !s.archived)
  const archived = subjects.filter((s) => s.archived)

  return (
    <Page>
      <PageHeader
        title="Materias"
        subtitle="Cada materia agrupa sus fechas, PDFs, apuntes y horas de estudio"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ocultar archivadas' : 'Ver archivadas'}
            </Button>
            {!creating && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={15} /> Nueva materia
              </Button>
            )}
          </>
        }
      />

      {creating && (
        <Card className="mb-4 p-4">
          <SubjectForm
            defaultColor={nextSubjectColor(subjects.map((s) => s.color))}
            submitLabel="Crear materia"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              await m.create.mutateAsync(input)
              setCreating(false)
            }}
          />
        </Card>
      )}

      {!isLoading && active.length === 0 && !creating ? (
        <Card>
          <EmptyState
            icon={Library}
            title="Todavía no cargaste materias"
            description="Empezá por las que estás cursando este cuatrimestre. La dificultad ayuda al planificador a ubicar cada materia según tu energía."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={15} /> Nueva materia
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {active.map((s) =>
            editingId === s.id ? (
              <Card key={s.id} className="p-4">
                <SubjectForm
                  initial={s}
                  submitLabel="Guardar"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (patch) => {
                    await m.update.mutateAsync({ id: s.id, patch })
                    setEditingId(null)
                  }}
                />
              </Card>
            ) : (
              <SubjectCard
                key={s.id}
                subject={s}
                onEdit={() => setEditingId(s.id)}
                onArchive={() => m.update.mutate({ id: s.id, patch: { archived: true } })}
                onDelete={() => m.remove.mutate(s.id)}
              />
            )
          )}
        </div>
      )}

      {showArchived && archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Archivadas</h2>
          <div className="grid grid-cols-1 gap-3 opacity-70 md:grid-cols-2">
            {archived.map((s) => (
              <SubjectCard
                key={s.id}
                subject={s}
                onArchive={() => m.update.mutate({ id: s.id, patch: { archived: false } })}
                onDelete={() => m.remove.mutate(s.id)}
              />
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}

function SubjectCard({
  subject: s,
  onEdit,
  onArchive,
  onDelete
}: {
  subject: Subject
  onEdit?: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const color = useSubjectColor()

  return (
    <Card className="group relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color(s.color) }} />
      <div className="flex items-start gap-3 py-3.5 pr-3 pl-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-medium">{s.name}</p>
            {s.code && <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{s.code}</span>}
          </div>
          <DifficultyMeter value={s.difficulty} />
        </div>

        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-danger">¿Borrar con sus PDFs y apuntes?</span>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Borrar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <div className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {onEdit && (
              <Button size="icon" variant="ghost" title="Editar" onClick={onEdit}>
                <Pencil size={14} />
              </Button>
            )}
            <Button size="icon" variant="ghost" title={s.archived ? 'Restaurar' : 'Archivar'} onClick={onArchive}>
              {s.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </Button>
            <Button size="icon" variant="ghost" title="Borrar" onClick={() => setConfirming(true)}>
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function DifficultyMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Dificultad: ${DIFFICULTY_LABELS[value]}`}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn('h-1.5 w-3 rounded-full', i <= value ? 'bg-accent arcade:shadow-glow' : 'bg-surface-2')}
          />
        ))}
      </div>
      <span className="text-[11px] text-fg-subtle">{DIFFICULTY_LABELS[value]}</span>
    </div>
  )
}

function SubjectForm({
  initial,
  defaultColor,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial?: Subject
  defaultColor?: string
  submitLabel: string
  onSubmit: (input: SubjectCreateInput) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [color, setColor] = useState(initial?.color ?? defaultColor ?? SUBJECT_PALETTE[0].light)
  const resolve = useSubjectColor()
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 3)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name, code: code.trim() || null, color, difficulty })
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} className="space-y-4">
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Field label="Nombre">
          <Input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Análisis Matemático II" />
        </Field>
        <Field label="Código (opcional)">
          <Input maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="AM2" />
        </Field>
      </div>

      <Field group label="Color">
        <div className="flex flex-wrap gap-2">
          {SUBJECT_PALETTE.map(({ light: c, name }) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${name}`}
              title={name}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className={cn(
                'h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110',
                c === color && 'ring-2 ring-fg'
              )}
              style={{ background: resolve(c) }}
            />
          ))}
        </div>
      </Field>

      <Field group label={`Dificultad · ${DIFFICULTY_LABELS[difficulty]}`} hint="Cuánta carga cognitiva te exige. Las exigentes se sugieren cuando tenés energía alta.">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDifficulty(i)}
              className={cn(
                'h-8 flex-1 rounded-card border text-xs font-medium transition-colors',
                i === difficulty
                  ? 'border-accent bg-accent-soft text-accent arcade:shadow-glow'
                  : 'border-line text-fg-muted hover:bg-surface-2'
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </Field>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          <X size={14} /> Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={saving || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
