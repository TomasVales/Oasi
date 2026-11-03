import { asc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { pdfAnchors } from '../schema'
import type { PdfAnchor } from '@shared/models'
import { NotFoundError } from './errors'

export type AnchorCreate = Omit<typeof pdfAnchors.$inferInsert, 'id' | 'createdAt'>

export function anchorsRepo(db: Db) {
  return {
    create(input: AnchorCreate): PdfAnchor {
      return db.insert(pdfAnchors).values(input).returning().get()
    },

    get(id: string): PdfAnchor {
      const row = db.select().from(pdfAnchors).where(eq(pdfAnchors.id, id)).get()
      if (!row) throw new NotFoundError('anchor', id)
      return row
    },

    listByDocument(documentId: string): PdfAnchor[] {
      return db
        .select()
        .from(pdfAnchors)
        .where(eq(pdfAnchors.documentId, documentId))
        .orderBy(asc(pdfAnchors.page))
        .all()
    }
  }
}
