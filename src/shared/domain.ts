/**
 * Enumeraciones del dominio. Viven en shared porque las usa tanto el esquema
 * de la DB (main) como la UI (renderer).
 */
export const EVENT_KINDS = ['class', 'exam', 'assignment', 'other'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/** Origen del evento: cargado a mano o sincronizado (solo lectura) desde Google Calendar. */
export const EVENT_SOURCES = ['manual', 'google'] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

export const ENERGY_LEVELS = ['low', 'medium', 'high'] as const
export type EnergyLevel = (typeof ENERGY_LEVELS)[number]

export const ANCHOR_KINDS = ['text', 'area'] as const
export type AnchorKind = (typeof ANCHOR_KINDS)[number]

/**
 * Rectángulo normalizado [0..1] relativo a la página del PDF (origen arriba-izquierda).
 * Al ser relativo, el deep link sobrevive a cambios de zoom y tamaño de ventana.
 */
export interface NormalizedRect {
  x: number
  y: number
  w: number
  h: number
}

/** Día calendario LOCAL en formato YYYY-MM-DD (clave del heatmap y de las rachas). */
export type LocalDate = string

export function toLocalDate(d: Date = new Date()): LocalDate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
