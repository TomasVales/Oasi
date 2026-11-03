import type { GoogleSettings } from '@shared/settings'
import type { Repositories } from '../db/repositories'
import type { SecretStore } from '../secrets'
import { GoogleApiError, GoogleCalendarClient, type GoogleCalendarListEntry } from './client'
import { authorizeWithLoopback, GOOGLE_ENDPOINTS, GoogleAuthError, refreshAccessToken, type GoogleEndpoints } from './oauth'
import { syncGoogleCalendars, type SyncResult } from './sync'

export interface GoogleStatus {
  hasCredentials: boolean
  connected: boolean
  clientId: string
  calendarIds: string[]
  lastSyncAt: number | null
  lastSyncError: string | null
}

const AUTO_SYNC_MS = 30 * 60_000

export class GoogleService {
  private accessToken: { value: string; expiresAt: number } | null = null
  private timer: NodeJS.Timeout | null = null
  private syncing: Promise<SyncResult> | null = null

  constructor(
    private readonly repos: Repositories,
    private readonly secrets: SecretStore,
    private readonly openBrowser: (url: string) => Promise<void>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoints: GoogleEndpoints = GOOGLE_ENDPOINTS
  ) {}

  private settings(): GoogleSettings {
    return this.repos.settings.get('google')
  }

  private patch(p: Partial<GoogleSettings>) {
    this.repos.settings.set('google', { ...this.settings(), ...p })
  }

  status(): GoogleStatus {
    const s = this.settings()
    return {
      hasCredentials: !!s.clientId && this.secrets.has('google.clientSecret'),
      connected: this.secrets.has('google.refreshToken'),
      clientId: s.clientId,
      calendarIds: s.calendarIds,
      lastSyncAt: s.lastSyncAt,
      lastSyncError: s.lastSyncError
    }
  }

  saveCredentials(clientId: string, clientSecret: string) {
    this.patch({ clientId })
    this.secrets.set('google.clientSecret', clientSecret)
  }

  private credentials() {
    const clientId = this.settings().clientId
    const clientSecret = this.secrets.get('google.clientSecret')
    if (!clientId || !clientSecret) throw new GoogleAuthError('Cargá el Client ID y el Client Secret de Google en Ajustes.')
    return { clientId, clientSecret }
  }

  async connect(): Promise<GoogleStatus> {
    const tokens = await authorizeWithLoopback({
      ...this.credentials(),
      openBrowser: this.openBrowser,
      fetchImpl: this.fetchImpl,
      endpoints: this.endpoints
    })
    this.secrets.set('google.refreshToken', tokens.refresh_token!)
    this.accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
    // Por defecto se sincroniza el calendario principal; el usuario puede elegir otros.
    if (!this.settings().calendarIds.length) this.patch({ calendarIds: ['primary'] })
    this.startAutoSync()
    void this.sync().catch(() => {})
    return this.status()
  }

  async disconnect(): Promise<void> {
    const refresh = this.secrets.get('google.refreshToken')
    if (refresh) {
      // Revocar del lado de Google es "mejor esfuerzo": si falla, igual se borra localmente.
      await this.fetchImpl(`${this.endpoints.revoke}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {})
    }
    this.secrets.delete('google.refreshToken')
    this.accessToken = null
    this.stopAutoSync()
    this.repos.events.removeBySource('google')
    this.patch({ calendarIds: [], lastSyncAt: null, lastSyncError: null })
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > Date.now()) return this.accessToken.value
    const refreshToken = this.secrets.get('google.refreshToken')
    if (!refreshToken) throw new GoogleAuthError('Google Calendar no está conectado.', true)
    try {
      const t = await refreshAccessToken({ ...this.credentials(), refreshToken }, this.fetchImpl, this.endpoints)
      this.accessToken = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 }
      return t.access_token
    } catch (err) {
      if (err instanceof GoogleAuthError && err.needsReconnect) this.secrets.delete('google.refreshToken')
      throw err
    }
  }

  private client() {
    return new GoogleCalendarClient(() => this.getAccessToken(), this.fetchImpl, this.endpoints)
  }

  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    return this.client().listCalendars()
  }

  setCalendars(ids: string[]) {
    this.patch({ calendarIds: ids })
  }

  /** Una sola sincronización a la vez: llamadas concurrentes comparten el resultado. */
  sync(): Promise<SyncResult> {
    this.syncing ??= (async () => {
      try {
        const result = await syncGoogleCalendars(this.client(), this.repos, this.settings().calendarIds)
        this.patch({ lastSyncAt: Date.now(), lastSyncError: null })
        return result
      } catch (err) {
        const message =
          err instanceof GoogleApiError || err instanceof GoogleAuthError ? err.message : 'No se pudo sincronizar (¿sin conexión?)'
        this.patch({ lastSyncError: message })
        throw err
      } finally {
        this.syncing = null
      }
    })()
    return this.syncing
  }

  startAutoSync() {
    if (this.timer || !this.status().connected) return
    this.timer = setInterval(() => void this.sync().catch(() => {}), AUTO_SYNC_MS)
  }

  stopAutoSync() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
