import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { flashcardReviews } from '../schema'

export type FlashcardReview = typeof flashcardReviews.$inferSelect

/** Progreso de repaso de cada tarjeta (el contenido vive en los apuntes). */
export function flashcardsRepo(db: Db) {
  return {
    all(): FlashcardReview[] {
      return db.select().from(flashcardReviews).all()
    },

    get(id: string): FlashcardReview | undefined {
      return db.select().from(flashcardReviews).where(eq(flashcardReviews.id, id)).get()
    },

    save(row: Omit<FlashcardReview, 'lastReviewedAt'> & { lastReviewedAt: Date }): FlashcardReview {
      const { id: _id, ...rest } = row
      return db
        .insert(flashcardReviews)
        .values(row)
        .onConflictDoUpdate({ target: flashcardReviews.id, set: rest })
        .returning()
        .get()
    }
  }
}
