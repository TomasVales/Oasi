import { asc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { folders } from '../schema'
import type { Folder } from '@shared/models'
import { NotFoundError } from './errors'

export interface FolderCreate {
  subjectId: string
  parentId?: string | null
  name: string
  emoji?: string
}

export interface FolderUpdate {
  name?: string
  emoji?: string
  parentId?: string | null
}

export function foldersRepo(db: Db) {
  const get = (id: string): Folder => {
    const row = db.select().from(folders).where(eq(folders.id, id)).get()
    if (!row) throw new NotFoundError('folder', id)
    return row
  }

  /** Verifica que `folderId` exista y pertenezca a la materia (o sea null = raíz). */
  const assertInSubject = (folderId: string | null | undefined, subjectId: string) => {
    if (!folderId) return
    if (get(folderId).subjectId !== subjectId) throw new Error('La carpeta pertenece a otra materia')
  }

  return {
    get,
    assertInSubject,

    listBySubject(subjectId: string): Folder[] {
      return db.select().from(folders).where(eq(folders.subjectId, subjectId)).orderBy(asc(folders.sortOrder), asc(folders.name)).all()
    },

    create(input: FolderCreate): Folder {
      assertInSubject(input.parentId, input.subjectId)
      return db.insert(folders).values(input).returning().get()
    },

    update(id: string, patch: FolderUpdate): Folder {
      const current = get(id)
      if (patch.parentId !== undefined && patch.parentId !== null) {
        assertInSubject(patch.parentId, current.subjectId)
        // Sin ciclos: la nueva madre no puede ser la carpeta ni una de sus descendientes.
        for (let p: string | null = patch.parentId; p; p = get(p).parentId) {
          if (p === id) throw new Error('Una carpeta no puede moverse dentro de sí misma')
        }
      }
      return db.update(folders).set(patch).where(eq(folders.id, id)).returning().get()!
    },

    /** Borra la carpeta y sus subcarpetas; los PDFs y apuntes que contenían vuelven a la raíz. */
    remove(id: string): void {
      db.delete(folders).where(eq(folders.id, id)).run()
    }
  }
}
