import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { documents } from '../schema'
import type { DocumentRecord } from '@shared/models'
import { NotFoundError } from './errors'

export type DocumentCreate = typeof documents.$inferInsert

/** Solo metadatos. Copiar/borrar el archivo físico es responsabilidad del servicio de biblioteca (Paso 4). */
export function documentsRepo(db: Db) {
  return {
    listBySubject(subjectId: string): DocumentRecord[] {
      return db
        .select()
        .from(documents)
        .where(eq(documents.subjectId, subjectId))
        .orderBy(desc(documents.lastOpenedAt), desc(documents.createdAt))
        .all()
    },

    listAll(): DocumentRecord[] {
      return db.select().from(documents).all()
    },

    get(id: string): DocumentRecord {
      const row = db.select().from(documents).where(eq(documents.id, id)).get()
      if (!row) throw new NotFoundError('document', id)
      return row
    },

    findByHash(subjectId: string, sha256: string): DocumentRecord | undefined {
      return db
        .select()
        .from(documents)
        .where(sql`${documents.subjectId} = ${subjectId} and ${documents.sha256} = ${sha256}`)
        .get()
    },

    create(input: DocumentCreate): DocumentRecord {
      return db.insert(documents).values(input).returning().get()
    },

    /** Registra la página abierta. `maxPageRead` solo crece. */
    trackPage(id: string, page: number): DocumentRecord {
      const row = db
        .update(documents)
        .set({
          lastPage: page,
          maxPageRead: sql`max(${documents.maxPageRead}, ${page})`,
          lastOpenedAt: new Date()
        })
        .where(eq(documents.id, id))
        .returning()
        .get()
      if (!row) throw new NotFoundError('document', id)
      return row
    },

    rename(id: string, title: string): DocumentRecord {
      const row = db.update(documents).set({ title }).where(eq(documents.id, id)).returning().get()
      if (!row) throw new NotFoundError('document', id)
      return row
    },

    /** Mueve a una carpeta de la misma materia (null = raíz). La validación de materia la hace quien llama. */
    move(id: string, folderId: string | null): DocumentRecord {
      const row = db.update(documents).set({ folderId }).where(eq(documents.id, id)).returning().get()
      if (!row) throw new NotFoundError('document', id)
      return row
    },

    remove(id: string): DocumentRecord | undefined {
      return db.delete(documents).where(eq(documents.id, id)).returning().get()
    }
  }
}
