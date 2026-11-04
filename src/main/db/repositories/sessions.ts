import { and, between, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { studySessions, subjects } from '../schema'
import { toLocalDate } from '@shared/domain'
import type { StudySession } from '@shared/models'
import { NotFoundError } from './errors'

export type SessionStart = Pick<
  typeof studySessions.$inferInsert,
  'subjectId' | 'eventId' | 'documentId' | 'checkInId' | 'plannedSeconds' | 'pagesFrom'
>

export interface SessionFinish {
  activeSeconds: number
  focusScore?: number | null
  pagesTo?: number | null
}

export interface DailyTotal {
  localDate: string
  seconds: number
}

export interface SubjectTotal {
  subjectId: string | null
  name: string | null
  color: string | null
  seconds: number
}

export function sessionsRepo(db: Db) {
  return {
    /** Solo puede haber una sesión activa: si queda una colgada (crash), se cierra antes. */
    start(input: SessionStart, now = new Date()): StudySession {
      return db.transaction((tx) => {
        tx.update(studySessions).set({ endedAt: now }).where(isNull(studySessions.endedAt)).run()
        return tx
          .insert(studySessions)
          .values({ ...input, startedAt: now, localDate: toLocalDate(now) })
          .returning()
          .get()
      })
    },

    /**
     * Al arrancar la app: una sesión sin cerrar es de un cierre inesperado. Se cierra con el
     * último tiempo guardado por el heartbeat (no se inventa tiempo que no se registró).
     */
    closeDangling(): number {
      const open = db.select().from(studySessions).where(isNull(studySessions.endedAt)).all()
      for (const s of open) {
        db.update(studySessions)
          .set({ endedAt: new Date(s.startedAt.getTime() + s.activeSeconds * 1000) })
          .where(eq(studySessions.id, s.id))
          .run()
      }
      return open.length
    },

    /** Segundos estudiados hoy por materia (alimenta al planificador). */
    secondsBySubjectOn(localDate: string): Record<string, number> {
      const rows = db
        .select({
          subjectId: studySessions.subjectId,
          seconds: sql<number>`cast(sum(${studySessions.activeSeconds}) as integer)`
        })
        .from(studySessions)
        .where(eq(studySessions.localDate, localDate))
        .groupBy(studySessions.subjectId)
        .all()
      return Object.fromEntries(rows.filter((r) => r.subjectId).map((r) => [r.subjectId!, r.seconds]))
    },

    active(): StudySession | undefined {
      return db.select().from(studySessions).where(isNull(studySessions.endedAt)).get()
    },

    /** Guardado periódico del cronómetro para no perder tiempo si la app se cierra. */
    heartbeat(id: string, activeSeconds: number): void {
      db.update(studySessions).set({ activeSeconds }).where(eq(studySessions.id, id)).run()
    },

    finish(id: string, data: SessionFinish, now = new Date()): StudySession {
      const row = db
        .update(studySessions)
        .set({ ...data, endedAt: now })
        .where(eq(studySessions.id, id))
        .returning()
        .get()
      if (!row) throw new NotFoundError('session', id)
      return row
    },

    /** Sesión cargada a mano (estudiaste sin la app): ya cerrada, cuenta para heatmap y racha. */
    log(input: { subjectId: string | null; minutes: number; endedAt: Date }): StudySession {
      const startedAt = new Date(input.endedAt.getTime() - input.minutes * 60_000)
      return db
        .insert(studySessions)
        .values({
          subjectId: input.subjectId,
          startedAt,
          endedAt: input.endedAt,
          localDate: toLocalDate(startedAt),
          plannedSeconds: input.minutes * 60,
          activeSeconds: input.minutes * 60
        })
        .returning()
        .get()
    },

    /** Corrige una sesión ya cerrada (tiempo, materia) o le agrega la reflexión final. */
    update(
      id: string,
      patch: { subjectId?: string | null; activeSeconds?: number; focusScore?: number | null; pagesTo?: number | null }
    ): StudySession {
      const row = db.update(studySessions).set(patch).where(eq(studySessions.id, id)).returning().get()
      if (!row) throw new NotFoundError('session', id)
      return row
    },

    remove(id: string): void {
      db.delete(studySessions).where(eq(studySessions.id, id)).run()
    },

    /** Sesiones cerradas entre dos días locales, de la más reciente a la más vieja. */
    listRange(fromDate: string, toDate: string): StudySession[] {
      return db
        .select()
        .from(studySessions)
        .where(and(between(studySessions.localDate, fromDate, toDate), isNotNull(studySessions.endedAt)))
        .orderBy(desc(studySessions.startedAt))
        .all()
    },

    listForDay(localDate: string): StudySession[] {
      return db.select().from(studySessions).where(eq(studySessions.localDate, localDate)).all()
    },

    recent(limit = 20): StudySession[] {
      return db.select().from(studySessions).orderBy(desc(studySessions.startedAt)).limit(limit).all()
    },

    /** Segundos estudiados por día local → heatmap y rachas. */
    dailyTotals(fromDate: string, toDate: string, subjectId?: string | null): DailyTotal[] {
      return db
        .select({
          localDate: studySessions.localDate,
          seconds: sql<number>`cast(sum(${studySessions.activeSeconds}) as integer)`
        })
        .from(studySessions)
        .where(
          and(
            between(studySessions.localDate, fromDate, toDate),
            subjectId ? eq(studySessions.subjectId, subjectId) : undefined
          )
        )
        .groupBy(studySessions.localDate)
        .orderBy(studySessions.localDate)
        .all()
    },

    /** Horas por materia en un rango de días → panel de estadísticas. */
    totalsBySubject(fromDate: string, toDate: string): SubjectTotal[] {
      return db
        .select({
          subjectId: studySessions.subjectId,
          name: subjects.name,
          color: subjects.color,
          seconds: sql<number>`cast(sum(${studySessions.activeSeconds}) as integer)`
        })
        .from(studySessions)
        .leftJoin(subjects, eq(subjects.id, studySessions.subjectId))
        .where(and(between(studySessions.localDate, fromDate, toDate)))
        .groupBy(studySessions.subjectId)
        .orderBy(desc(sql`sum(${studySessions.activeSeconds})`))
        .all()
    }
  }
}
