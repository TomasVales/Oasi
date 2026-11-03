import { desc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { planSnapshots } from '../schema'

export type PlanSnapshot = typeof planSnapshots.$inferSelect
export type PlanSnapshotCreate = Omit<typeof planSnapshots.$inferInsert, 'id' | 'createdAt'> & { createdAt?: Date }

export function plansRepo(db: Db) {
  return {
    latestForDay(localDate: string): PlanSnapshot | undefined {
      return db.select().from(planSnapshots).where(eq(planSnapshots.localDate, localDate)).orderBy(desc(planSnapshots.createdAt)).get()
    },
    create(input: PlanSnapshotCreate): PlanSnapshot {
      return db.insert(planSnapshots).values(input).returning().get()
    }
  }
}
