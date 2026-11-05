import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSubjects } from '@/hooks/useSubjects'
import { useSubjectColor } from '@/hooks/useSubjectColor'
import { useSession } from '@/features/session/SessionProvider'

/**
 * Nombre de la materia de la sesión en curso, que se puede tocar para cambiarla
 * (p. ej. una sesión libre que en realidad es de Italiano).
 */
export function SessionSubjectPicker({ className, dotClassName }: { className?: string; dotClassName?: string }) {
  const { session, setSubject } = useSession()
  const { data: subjects } = useSubjects()
  const color = useSubjectColor()
  if (!session) return null
  const subject = subjects?.find((s) => s.id === session.subjectId)

  return (
    <label
      title="Cambiar a qué materia va esta sesión"
      className={cn('no-drag group relative flex min-w-0 cursor-pointer items-center gap-1.5 rounded-[6px] hover:text-fg', className)}
    >
      {subject && <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClassName)} style={{ background: color(subject.color) }} />}
      <span className="truncate">{subject?.name ?? 'Sesión libre'}</span>
      <ChevronDown size={12} className="shrink-0 opacity-50 group-hover:opacity-100" />
      <select
        aria-label="Materia de la sesión"
        value={session.subjectId ?? ''}
        onChange={(e) => void setSubject(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Sesión libre (sin materia)</option>
        {subjects?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
