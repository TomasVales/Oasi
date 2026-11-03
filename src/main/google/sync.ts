import { matchSubject } from '@shared/subjectMatch'
import type { Repositories } from '../db/repositories'
import type { GoogleCalendarClient, GoogleEvent } from './client'

export interface SyncResult {
  upserted: number
  removed: number
  calendars: number
}

/** Ventana sincronizada: una semana hacia atrás y un cuatrimestre hacia adelante. */
export const SYNC_PAST_DAYS = 7
export const SYNC_FUTURE_DAYS = 150

function parseTime(t: { date?: string; dateTime?: string }): { at: Date; allDay: boolean } | null {
  if (t.dateTime) return { at: new Date(t.dateTime), allDay: false }
  if (t.date) {
    const [y, m, d] = t.date.split('-').map(Number) as [number, number, number]
    return { at: new Date(y, m - 1, d), allDay: true } // medianoche LOCAL del día
  }
  return null
}

/** Convierte un evento de Google al formato local. Devuelve null si debe ignorarse. */
export function mapGoogleEvent(e: GoogleEvent, calendarId: string, subjects: { id: string; name: string; code: string | null }[]) {
  if (e.status === 'cancelled') return null
  const start = parseTime(e.start)
  if (!start) return null
  const end = e.end ? parseTime(e.end) : null
  const title = (e.summary ?? '').trim() || 'Evento sin título'
  const subject = matchSubject(`${title} ${e.description ?? ''}`, subjects)
  return {
    externalId: `${calendarId}:${e.id}`,
    // Los de horario fijo son clases (bloquean el planificador); los de día completo
    // (feriados, cumpleaños) se guardan como "otro" para no bloquear días enteros.
    kind: start.allDay ? ('other' as const) : ('class' as const),
    title: title.slice(0, 160),
    description: [e.location && `📍 ${e.location}`, e.description].filter(Boolean).join('\n').slice(0, 5000) || null,
    startsAt: start.at,
    endsAt: end?.at ?? null,
    allDay: start.allDay,
    subjectId: subject?.id ?? null,
    weight: 1
  }
}

/** Sincronización de solo lectura e idempotente: crea/actualiza y elimina lo que ya no está en Google. */
export async function syncGoogleCalendars(
  client: GoogleCalendarClient,
  repos: Repositories,
  calendarIds: string[],
  now = new Date()
): Promise<SyncResult> {
  const from = new Date(now.getTime() - SYNC_PAST_DAYS * 86_400_000)
  const to = new Date(now.getTime() + SYNC_FUTURE_DAYS * 86_400_000)
  const subjects = repos.subjects.list({ includeArchived: true })

  // Primero se descarga todo: si la red falla a mitad, no se borra nada local.
  const fetched = await Promise.all(calendarIds.map(async (id) => ({ id, events: await client.listEvents(id, from, to) })))

  const seen = new Set<string>()
  let upserted = 0
  for (const { id, events } of fetched) {
    for (const e of events) {
      const mapped = mapGoogleEvent(e, id, subjects)
      if (!mapped) continue
      repos.events.upsertExternal('google', mapped)
      seen.add(mapped.externalId)
      upserted++
    }
  }

  const stale = repos.events.listExternal('google', from, to).filter((e) => !seen.has(e.externalId ?? ''))
  repos.events.removeMany(stale.map((e) => e.id))
  return { upserted, removed: stale.length, calendars: calendarIds.length }
}
