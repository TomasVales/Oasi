export const THEMES = ['zen', 'focus', 'arcade'] as const
export type ThemeName = (typeof THEMES)[number]

export const AI_PROVIDERS = ['none', 'anthropic', 'ollama'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export interface AiSettings {
  provider: AiProvider
  /** Modelo de Claude (API de Anthropic). */
  anthropicModel: string
  ollamaUrl: string
  ollamaModel: string
}

/** Configuración no secreta de Google Calendar (los tokens y el secreto van cifrados aparte). */
export interface GoogleSettings {
  clientId: string
  calendarIds: string[]
  lastSyncAt: number | null
  lastSyncError: string | null
}

/** Widgets del dashboard de Inicio (el orden del array es el orden en pantalla). */
export const DASHBOARD_WIDGETS = ['plan', 'countdown', 'streak', 'milestones', 'today', 'heatmap'] as const
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number]

export interface DashboardSettings {
  order: DashboardWidget[]
  hidden: DashboardWidget[]
}

export interface IdleSettings {
  enabled: boolean
  /** Minutos sin actividad del sistema antes de activar el modo ausente. */
  minutes: number
}

export type AppIconVariant = 'clasico' | 'noche' | 'neon'

export interface BackgroundSettings {
  /** Archivo en userData/backgrounds (lo escribe solo el proceso main). null = sin fondo. */
  fileName: string | null
  mime: string | null
  /** Opacidad del velo del tema sobre la imagen (0 = imagen pura, 1 = tema sólido). */
  overlay: Record<ThemeName, number>
  /** Desenfoque de la imagen en px. */
  blur: number
}

export const SOUNDSCAPES = ['rain', 'cafe', 'white', 'pink', 'brown'] as const
export type SoundscapeId = (typeof SOUNDSCAPES)[number]

export interface SoundscapeSettings {
  /** Desactivado: no se muestra el reproductor ni suena nada automáticamente. */
  enabled: boolean
  /** Arranca solo al empezar o reanudar el foco del cronómetro. */
  autoplay: boolean
  /** Se silencia en los descansos (y vuelve con el foco). */
  pauseOnBreak: boolean
  sound: SoundscapeId
  /** 0–1 */
  volume: number
}

export interface AppSettings {
  theme: ThemeName
  pomodoro: {
    focusMinutes: number
    shortBreakMinutes: number
    longBreakMinutes: number
    cyclesBeforeLongBreak: number
  }
  /** Minutos mínimos de estudio en un día para que cuente en la racha. */
  streakMinMinutes: number
  ai: AiSettings
  google: GoogleSettings
  profile: { name: string }
  idle: IdleSettings
  dashboard: DashboardSettings
  appIcon: AppIconVariant
  soundscape: SoundscapeSettings
  background: BackgroundSettings
  /** Bienvenida de primer uso; null = todavía no se completó. */
  onboarding: { completedAt: number | null }
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'zen',
  pomodoro: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 25, cyclesBeforeLongBreak: 3 },
  streakMinMinutes: 15,
  ai: { provider: 'none', anthropicModel: 'claude-opus-5-5', ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: '' },
  google: { clientId: '', calendarIds: [], lastSyncAt: null, lastSyncError: null },
  profile: { name: '' },
  idle: { enabled: true, minutes: 10 },
  dashboard: { order: [...DASHBOARD_WIDGETS], hidden: [] },
  appIcon: 'clasico',
  soundscape: { enabled: true, autoplay: true, pauseOnBreak: true, sound: 'rain', volume: 0.5 },
  background: { fileName: null, mime: null, overlay: { zen: 0.82, focus: 0.78, arcade: 0.66 }, blur: 6 },
  onboarding: { completedAt: null }
}

export type SettingKey = keyof AppSettings
