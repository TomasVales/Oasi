import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  MessagesSquare,
  NotebookPen,
  PartyPopper,
  Presentation,
  User,
  type LucideIcon
} from 'lucide-react'
import { LIFE_EVENT_KINDS, UNI_EVENT_KINDS, type EventKind } from '@shared/domain'

interface KindMeta {
  label: string
  icon: LucideIcon
  /** Color para eventos sin materia (los de la vida fuera de la facultad). */
  color: string
  /** Título sugerido cuando no se escribe uno. */
  placeholder: string
}

export const KIND_META: Record<EventKind, KindMeta> = {
  class: { label: 'Clase', icon: Presentation, color: '#64748b', placeholder: 'Clase' },
  exam: { label: 'Parcial', icon: GraduationCap, color: '#e5484d', placeholder: 'Parcial' },
  assignment: { label: 'Entrega', icon: NotebookPen, color: '#f5a524', placeholder: 'Entrega' },
  consultation: { label: 'Consulta', icon: MessagesSquare, color: '#3e9b8f', placeholder: 'Consulta con el profe' },
  procedure: { label: 'Trámite', icon: ClipboardList, color: '#8e7cc3', placeholder: 'Inscripción a materias' },
  other: { label: 'Evento', icon: CalendarClock, color: '#7c8592', placeholder: 'Evento' },
  work: { label: 'Trabajo', icon: Briefcase, color: '#4f7dd8', placeholder: 'Turno en el trabajo' },
  personal: { label: 'Personal', icon: User, color: '#b07cd8', placeholder: 'Algo personal' },
  health: { label: 'Salud', icon: HeartPulse, color: '#e0607e', placeholder: 'Turno médico' },
  sport: { label: 'Deporte', icon: Dumbbell, color: '#3fa66b', placeholder: 'Gimnasio' },
  social: { label: 'Salida', icon: PartyPopper, color: '#e08a3c', placeholder: 'Cumpleaños' }
}

export const KIND_LABEL = Object.fromEntries(Object.entries(KIND_META).map(([k, m]) => [k, m.label])) as Record<EventKind, string>

export const KIND_GROUPS: { label: string; kinds: readonly EventKind[] }[] = [
  { label: 'Facultad', kinds: UNI_EVENT_KINDS },
  { label: 'Fuera de la facultad', kinds: LIFE_EVENT_KINDS }
]
