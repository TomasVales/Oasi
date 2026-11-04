import { Client } from 'discord-rpc'
import type { PresenceActivity } from '@shared/discord'

const CLIENT_ID = '1567335462433984572'
/** Discord acepta ~5 actualizaciones cada 20 s: con 15 s entre envíos sobra margen. */
const MIN_INTERVAL_MS = 15_000
const RETRY_MS = 60_000

/**
 * Rich Presence de Discord. Si Discord no está abierto, reintenta cada minuto en silencio.
 * Las actualizaciones se agrupan: siempre se manda la última, como mucho una cada 15 s
 * (la cuenta regresiva la anima Discord solo, con endTimestamp).
 */
export class DiscordPresence {
  private rpc: Client | null = null
  private ready = false
  private pending: PresenceActivity | null | undefined = undefined
  private lastSent = 0
  private lastKey = ''
  private timer: NodeJS.Timeout | null = null
  private retry: NodeJS.Timeout | null = null
  private stopped = false

  start() {
    this.stopped = false
    this.connect()
  }

  private connect() {
    if (this.stopped || this.rpc) return
    const rpc = new Client({ transport: 'ipc' })
    this.rpc = rpc
    rpc.on('ready', () => {
      this.ready = true
      this.lastKey = ''
      this.flush()
    })
    rpc.on('disconnected', () => this.reset())
    rpc.login({ clientId: CLIENT_ID }).catch(() => this.reset())
  }

  private reset() {
    this.ready = false
    const old = this.rpc
    this.rpc = null
    void old?.destroy().catch(() => {})
    if (this.stopped || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = null
      this.connect()
    }, RETRY_MS)
  }

  /** null = borrar la actividad (desactivado en Ajustes). */
  update(activity: PresenceActivity | null) {
    this.pending = activity
    this.flush()
  }

  private flush() {
    if (!this.ready || !this.rpc || this.pending === undefined) return
    const key = JSON.stringify(this.pending)
    if (key === this.lastKey) return
    const wait = this.lastSent + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) {
      this.timer ??= setTimeout(() => {
        this.timer = null
        this.flush()
      }, wait)
      return
    }
    const activity = this.pending
    this.lastKey = key
    this.lastSent = Date.now()
    const req = activity ? this.rpc.setActivity({ ...activity, instance: false }) : this.rpc.clearActivity()
    void Promise.resolve(req).catch(() => this.reset())
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    if (this.retry) clearTimeout(this.retry)
    void this.rpc?.clearActivity().catch(() => {})
    void this.rpc?.destroy().catch(() => {})
    this.rpc = null
  }
}
