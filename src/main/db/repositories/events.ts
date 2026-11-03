import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { events } from '../schema'
import type { EventKind } from '@shared/domain'
import type {
  EventCreateInput,
  EventRangeQuery,
  EventUpdateInput,
  UpcomingQuery
} from '@shared/validation'
import type { CalendarEvent } from '@shared/models'
import { NotFoundError } from './errors'

/** Hitos que el usuario carga a mano y que alimentan cuenta regresiva y planificador. */
const MILESTONE_KINDS: EventKind[] = ['exam', 'assignment']

export type ExternalEventInput = Omit<EventCreateInput, 'completedAt'> & { externalId: string }

export function eventsRepo(db: Db) {
  return {
    /** Eventos que se solapan con [from, to]. Un evento sin fin se trata como puntual. */
    listRange(q: EventRangeQuery): CalendarEvent[] {
      const end = sql`coalesce(${events.endsAt}, ${events.startsAt})`
      return db
        .select()
        .from(events)
        .where(
          and(
            lte(events.startsAt, q.to),
            gte(end, q.from.getTime()),
            q.kinds?.length ? inArray(events.kind, q.kinds) : undefined,
            q.subjectId ? eq(events.subjectId, q.subjectId) : undefined
          )
        )
        .orderBy(asc(events.startsAt))
        .all()
    },

    /** Próximos hitos pendientes (para la línea de tiempo y la cuenta regresiva). */
    upcoming(q: UpcomingQuery = {}, now = new Date()): CalendarEvent[] {
      return db
        .select()
        .from(events)
        .where(
          and(
            gte(events.startsAt, now),
            isNull(events.completedAt),
            inArray(events.kind, q.kinds?.length ? q.kinds : MILESTONE_KINDS)
          )
        )
        .orderBy(asc(events.startsAt))
        .limit(q.limit ?? 10)
        .all()
    },

    get(id: string): CalendarEvent {
      const row = db.select().from(events).where(eq(events.id, id)).get()
      if (!row) throw new NotFoundError('event', id)
      return row
    },

    create(input: EventCreateInput): CalendarEvent {
      return db.insert(events).values({ ...input, source: 'manual' }).returning().get()
    },

    update(id: string, patch: EventUpdateInput): CalendarEvent {
      const current = this.get(id)
      if (current.source !== 'manual') {
        // Los eventos de Google son de solo lectura: solo se permite marcarlos como completados.
        const { completedAt } = patch
        patch = completedAt === undefined ? {} : { completedAt }
      }
      const row = db.update(events).set(patch).where(eq(events.id, id)).returning().get()
      if (!row) throw new NotFoundError('event', id)
      return row
    },

    remove(id: string): void {
      db.delete(events).where(eq(events.id, id)).run()
    },

    /** Eventos externos (ej. Google) cuyo inicio cae en [from, to]: para detectar los borrados. */
    listExternal(source: 'google', from: Date, to: Date): CalendarEvent[] {
      return db
        .select()
        .from(events)
        .where(and(eq(events.source, source), gte(events.startsAt, from), lte(events.startsAt, to)))
        .all()
    },

    removeMany(ids: string[]): void {
      if (ids.length) db.delete(events).where(inArray(events.id, ids)).run()
    },

    /** Al desconectar Google: se borran todos sus eventos. */
    removeBySource(source: 'google'): number {
      return db.delete(events).where(eq(events.source, source)).returning({ id: events.id }).all().length
    },

    /** Upsert idempotente para el sync de Google Calendar. */
    upsertExternal(source: 'google', input: ExternalEventInput): CalendarEvent {
      const values = { ...input, source }
      const { externalId: _externalId, ...updatable } = input
      return db
        .insert(events)
        .values(values)
        .onConflictDoUpdate({ target: [events.source, events.externalId], set: updatable })
        .returning()
        .get()
    }
  }
}
