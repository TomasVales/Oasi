import {
  BookOpenText,
  CalendarDays,
  ChartColumn,
  Home,
  Library,
  Settings,
  type LucideIcon
} from 'lucide-react'

export interface NavItem {
  path: string
  /** Nombre visible de la sección. */
  label: string
  icon: LucideIcon
  /** Descripción que aparece en el encabezado de la sección. */
  topic: string
  /** Tecla que, con ⌘ (macOS) o Ctrl, navega a la sección. */
  shortcut: string
}

export const HOME_NAV: NavItem[] = [
  { path: '/', label: 'Inicio', icon: Home, topic: 'Tu plan de ahora, racha y actividad', shortcut: '1' },
  { path: '/calendario', label: 'Calendario', icon: CalendarDays, topic: 'Parciales, entregas y clases', shortcut: '2' },
  { path: '/estudio', label: 'Estudio', icon: BookOpenText, topic: 'PDF y apuntes lado a lado', shortcut: '3' },
  { path: '/materias', label: 'Materias', icon: Library, topic: 'Tus materias del cuatrimestre', shortcut: '4' },
  { path: '/estadisticas', label: 'Estadísticas', icon: ChartColumn, topic: 'Horas invertidas por materia', shortcut: '5' }
]

export const SETTINGS_NAV: NavItem = { path: '/ajustes', label: 'Ajustes', icon: Settings, topic: 'Apariencia y datos', shortcut: ',' }

export const ALL_NAV = [...HOME_NAV, SETTINGS_NAV]

export const MOD_KEY_LABEL = window.studentOS.app.platform === 'darwin' ? '⌘' : 'Ctrl+'

export function navForPath(pathname: string): NavItem | undefined {
  return ALL_NAV.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)))
}
