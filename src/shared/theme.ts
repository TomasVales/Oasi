import { THEMES, type ThemeName } from './settings'

export interface ThemeMeta {
  label: string
  tagline: string
  /** Debe coincidir con --canvas del tema en globals.css: se usa como fondo nativo de la ventana. */
  windowBackground: string
}

export const THEME_META: Record<ThemeName, ThemeMeta> = {
  zen: { label: 'Zen', tagline: 'Claro y sereno, sin ruido visual', windowBackground: '#ffffff' },
  focus: { label: 'Enfoque', tagline: 'Negro absoluto para estudiar de noche', windowBackground: '#000000' },
  arcade: { label: 'Arcade', tagline: 'Neón y alto contraste, modo juego', windowBackground: '#07040f' }
}

export function isTheme(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

export function nextTheme(t: ThemeName): ThemeName {
  return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]!
}

/** Argumento de línea de comandos con el que el main le pasa el tema inicial al preload. */
export const THEME_ARG_PREFIX = '--student-os-theme='
