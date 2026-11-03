import { asc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { subjects } from '../schema'
import type { SubjectCreateInput, SubjectListQuery, SubjectUpdateInput } from '@shared/validation'
import type { Subject } from '@shared/models'
import { nextSubjectColor } from '@shared/subjectColors'
import { NotFoundError } from './errors'

export function subjectsRepo(db: Db) {
  return {
    list(q: SubjectListQuery = {}): Subject[] {
      return db
        .select()
        .from(subjects)
        .where(q.includeArchived ? undefined : eq(subjects.archived, false))
        .orderBy(asc(subjects.name))
        .all()
    },

    get(id: string): Subject {
      const row = db.select().from(subjects).where(eq(subjects.id, id)).get()
      if (!row) throw new NotFoundError('subject', id)
      return row
    },

    create(input: SubjectCreateInput): Subject {
      const color = input.color ?? nextSubjectColor(this.list().map((s) => s.color))
      return db.insert(subjects).values({ ...input, color }).returning().get()
    },

    update(id: string, patch: SubjectUpdateInput): Subject {
      const row = db.update(subjects).set(patch).where(eq(subjects.id, id)).returning().get()
      if (!row) throw new NotFoundError('subject', id)
      return row
    },

    /** Borra la materia y en cascada sus eventos, documentos y apuntes. Las sesiones quedan (sin materia). */
    remove(id: string): void {
      db.delete(subjects).where(eq(subjects.id, id)).run()
    }
  }
}
