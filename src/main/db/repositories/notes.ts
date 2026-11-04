import { desc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { notes } from '../schema'
import type { Note } from '@shared/models'
import { NotFoundError } from './errors'

export type NoteCreate = Pick<typeof notes.$inferInsert, 'subjectId' | 'documentId' | 'folderId' | 'title' | 'content'>
export type NoteUpdate = Partial<Omit<NoteCreate, 'subjectId'>>

export function notesRepo(db: Db) {
  return {
    listAll(): Note[] {
      return db.select().from(notes).all()
    },

    listBySubject(subjectId: string): Note[] {
      return db.select().from(notes).where(eq(notes.subjectId, subjectId)).orderBy(desc(notes.updatedAt)).all()
    },

    get(id: string): Note {
      const row = db.select().from(notes).where(eq(notes.id, id)).get()
      if (!row) throw new NotFoundError('note', id)
      return row
    },

    create(input: NoteCreate): Note {
      return db.insert(notes).values(input).returning().get()
    },

    update(id: string, patch: NoteUpdate): Note {
      const row = db.update(notes).set(patch).where(eq(notes.id, id)).returning().get()
      if (!row) throw new NotFoundError('note', id)
      return row
    },

    /** Mueve a una carpeta de la misma materia (null = raíz). La validación de materia la hace quien llama. */
    move(id: string, folderId: string | null): Note {
      const row = db.update(notes).set({ folderId }).where(eq(notes.id, id)).returning().get()
      if (!row) throw new NotFoundError('note', id)
      return row
    },

    remove(id: string): void {
      db.delete(notes).where(eq(notes.id, id)).run()
    }
  }
}
