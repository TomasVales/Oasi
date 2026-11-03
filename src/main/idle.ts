import type { IdleSettings } from '@shared/settings'

export interface IdleSource {
  /** Segundos desde el último input del usuario en TODO el sistema (no solo en la app). */
  getSystemIdleTime(): number
  on(event: 'lock-screen', cb: () => void): unknown
}

import type { AwayEvent } from '@shared/ipc'
export type { AwayEvent }

const POLL_MS = 5000
/** Por debajo de esto se considera que el usuario volvió y el monitor se rearma. */
const BACK_THRESHOLD_S = 3

/**
 * Detecta ausencia por inactividad del sistema o por bloqueo de pantalla.
 * Emite UNA vez por ausencia; vuelve a armarse cuando hay input de nuevo.
 */
export class IdleMonitor {
  private away = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly source: IdleSource,
    private readonly getSettings: () => IdleSettings,
    private readonly onAway: (e: AwayEvent) => void
  ) {
    source.on('lock-screen', () => this.trigger({ idleSeconds: 0, reason: 'lock' }))
  }

  private trigger(e: AwayEvent) {
    if (this.away || !this.getSettings().enabled) return
    this.away = true
    this.onAway(e)
  }

  /** Una pasada de chequeo (el intervalo la llama; los tests también). */
  check(): void {
    const idle = this.source.getSystemIdleTime()
    if (this.away && idle < BACK_THRESHOLD_S) this.away = false
    const { enabled, minutes } = this.getSettings()
    if (enabled && idle >= minutes * 60) this.trigger({ idleSeconds: idle, reason: 'idle' })
  }

  start() {
    this.timer ??= setInterval(() => this.check(), POLL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
