/**
 * Qué mostrar en el perfil de Discord ("Rich Presence"). Es una función pura: el renderer
 * le pasa lo que está pasando en la app y el main manda el resultado a Discord.
 * Discord muestra dos líneas (details y state), un contador de tiempo y la imagen con tooltip.
 */
export interface DiscordSettings {
  enabled: boolean
  /** Nombre de la materia (si no, solo "Estudiando"). */
  showSubject: boolean
  /** Título del PDF o apunte abierto. */
  showTitles: boolean
  /** Racha y horas de hoy en el tooltip de la imagen. */
  showStats: boolean
}

export const DEFAULT_DISCORD: DiscordSettings = { enabled: true, showSubject: true, showTitles: false, showStats: true }

export type Section = 'home' | 'calendar' | 'study' | 'subjects' | 'stats' | 'review' | 'settings'

export interface PresenceInput {
  settings: DiscordSettings
  session: {
    subjectName: string | null
    modeLabel: string | null
    phase: 'focus' | 'break' | 'done'
    running: boolean
    /** Epoch ms en que termina la fase (si está corriendo). */
    phaseEndsAt: number | null
    focusedSeconds: number
    cycle: number
    /** Minutos de foco de cada pomodoro y del bloque planificado (null = libre). */
    focusMinutes: number
    plannedMinutes: number | null
  } | null
  view: {
    section: Section
    subjectName: string | null
    docTitle: string | null
    noteTitle: string | null
  }
  streak: number
  todaySeconds: number
  dueCards: number
  /** Epoch ms de cuando se abrió la app (contador "transcurrido" fuera de las sesiones). */
  appStartedAt: number
}

export interface PresenceActivity {
  details: string
  state: string
  startTimestamp?: number
  endTimestamp?: number
  largeImageKey: string
  largeImageText: string
}

const LIMIT = 128

/** Discord exige 2–128 caracteres por línea. */
function line(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length < 2) return `${t}  `.slice(0, 2)
  return t.length > LIMIT ? `${t.slice(0, LIMIT - 1)}…` : t
}

export function durationLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const quote = (t: string) => `«${t}»`

export function buildPresence(input: PresenceInput): PresenceActivity {
  const { settings: cfg, session: s, view } = input
  const subject = (name: string | null) => (cfg.showSubject && name ? name : null)

  const statBits: string[] = []
  if (cfg.showStats) {
    if (input.streak > 0) statBits.push(`🔥 ${input.streak} ${input.streak === 1 ? 'día' : 'días'} de racha`)
    if (input.todaySeconds >= 60) statBits.push(`${durationLabel(input.todaySeconds)} hoy`)
  }
  const largeImageText = line(['Oasi', ...statBits].join(' · '))
  const base = { largeImageKey: 'logo', largeImageText }

  // Lo que está mirando, para la segunda línea (si se permite mostrar títulos).
  const doing =
    cfg.showTitles && view.section === 'study'
      ? view.noteTitle
        ? `✍️ Escribiendo ${quote(view.noteTitle)}`
        : view.docTitle
          ? `📖 Leyendo ${quote(view.docTitle)}`
          : null
      : view.section === 'review'
        ? `🧠 Repasando tarjetas${input.dueCards ? ` · ${input.dueCards} pendientes` : ''}`
        : null

  if (s) {
    const subj = subject(s.subjectName)
    const pomodoro = `Pomodoro ${s.cycle}${s.plannedMinutes ? ` de ${Math.max(1, Math.ceil(s.plannedMinutes / s.focusMinutes))}` : ''}`
    const timer = s.running && s.phaseEndsAt ? { endTimestamp: s.phaseEndsAt } : {}
    if (s.phase === 'break') {
      return {
        ...base,
        ...timer,
        details: line(`☕ Descansando${subj ? ` · ${subj}` : ''}`),
        state: line(`Después del ${pomodoro.toLowerCase()} · ${durationLabel(s.focusedSeconds)} de foco`)
      }
    }
    if (s.phase === 'done') {
      return {
        ...base,
        details: line(`✅ Bloque completo${subj ? ` · ${subj}` : ''}`),
        state: line(`${durationLabel(s.focusedSeconds)} de foco · ${s.cycle} ${s.cycle === 1 ? 'pomodoro' : 'pomodoros'}`)
      }
    }
    if (!s.running) {
      return {
        ...base,
        details: line(`⏸ En pausa${subj ? ` · ${subj}` : ''}`),
        state: line(`${pomodoro} · ${durationLabel(s.focusedSeconds)} de foco`)
      }
    }
    return {
      ...base,
      ...timer,
      details: line(`🍅 Estudiando${subj ? ` ${subj}` : ''}${s.modeLabel ? ` · ${s.modeLabel}` : ''}`),
      state: line(doing ?? `${pomodoro} · ${s.focusedSeconds >= 60 ? `${durationLabel(s.focusedSeconds)} de foco` : 'recién empieza'}`)
    }
  }

  const subj = subject(view.subjectName)
  const since = { startTimestamp: input.appStartedAt }
  switch (view.section) {
    case 'study':
      return { ...base, ...since, details: line(subj ? `📚 En ${subj}` : '📚 Con sus apuntes'), state: line(doing ?? 'Preparándose para estudiar') }
    case 'review':
      return { ...base, ...since, details: line(subj ? `🧠 Repasando ${subj}` : '🧠 Repasando tarjetas'), state: line(input.dueCards ? `${input.dueCards} tarjetas pendientes` : 'Al día con el repaso') }
    case 'calendar':
      return { ...base, ...since, details: line('📅 Mirando el calendario'), state: line(subj ? `Fechas de ${subj}` : 'Parciales, entregas y la semana') }
    case 'stats':
      return { ...base, ...since, details: line('📊 Mirando su progreso'), state: line(statBits[0] ?? 'Estadísticas de estudio') }
    case 'subjects':
      return { ...base, ...since, details: line('🗂️ Organizando materias'), state: line('Armando el cuatrimestre') }
    case 'settings':
      return { ...base, ...since, details: line('⚙️ Ajustando Oasi'), state: line('Configurando su espacio de estudio') }
    default:
      return { ...base, ...since, details: line('🌿 Organizando el día'), state: line(statBits[0] ?? 'Planificando qué estudiar') }
  }
}
