import { GOOGLE_ENDPOINTS, type GoogleEndpoints } from './oauth'

export interface GoogleCalendarListEntry {
  id: string
  summary: string
  primary?: boolean
  backgroundColor?: string
  accessRole: string
}

export interface GoogleEventTime {
  date?: string // eventos de día completo: YYYY-MM-DD
  dateTime?: string // RFC3339
}

export interface GoogleEvent {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  location?: string
  start: GoogleEventTime
  end?: GoogleEventTime
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'GoogleApiError'
  }
}

/** Cliente mínimo de la API de Google Calendar v3 (solo lectura). */
export class GoogleCalendarClient {
  constructor(
    private readonly getAccessToken: () => Promise<string>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoints: GoogleEndpoints = GOOGLE_ENDPOINTS
  ) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.endpoints.api}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${await this.getAccessToken()}` } })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new GoogleApiError(body.error?.message ?? `Google Calendar respondió ${res.status}`, res.status)
    }
    return (await res.json()) as T
  }

  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const out: GoogleCalendarListEntry[] = []
    let pageToken: string | undefined
    do {
      const page = await this.get<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>('/users/me/calendarList', {
        maxResults: '250',
        ...(pageToken ? { pageToken } : {})
      })
      out.push(...(page.items ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return out
  }

  /** Eventos en el rango, con las recurrencias expandidas en instancias (`singleEvents`). */
  async listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
    const out: GoogleEvent[] = []
    let pageToken: string | undefined
    do {
      const page = await this.get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
          ...(pageToken ? { pageToken } : {})
        }
      )
      out.push(...(page.items ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return out
  }
}
