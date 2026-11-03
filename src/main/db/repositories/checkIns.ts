import { desc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { checkIns } from '../schema'
import { toLocalDate, type EnergyLevel } from '@shared/domain'
import type { CheckIn } from '@shared/models'

export function checkInsRepo(db: Db) {
  return {
    create(input: { energy: EnergyLevel; urgentSubjectId?: string | null }, now = new Date()): CheckIn {
      return db
        .insert(checkIns)
        .values({ ...input, localDate: toLocalDate(now), createdAt: now })
        .returning()
        .get()
    },

    /** Último check-in del día: si existe, no se vuelve a preguntar. */
    latestForDay(localDate: string): CheckIn | undefined {
      return db
        .select()
        .from(checkIns)
        .where(eq(checkIns.localDate, localDate))
        .orderBy(desc(checkIns.createdAt))
        .get()
    }
  }
}
