import type { Db } from '../client'
import { anchorsRepo } from './anchors'
import { checkInsRepo } from './checkIns'
import { documentsRepo } from './documents'
import { eventsRepo } from './events'
import { foldersRepo } from './folders'
import { flashcardsRepo } from './flashcards'
import { notesRepo } from './notes'
import { plansRepo } from './plans'
import { sessionsRepo } from './sessions'
import { settingsRepo } from './settings'
import { subjectsRepo } from './subjects'

export function createRepositories(db: Db) {
  return {
    subjects: subjectsRepo(db),
    events: eventsRepo(db),
    folders: foldersRepo(db),
    flashcards: flashcardsRepo(db),
    documents: documentsRepo(db),
    notes: notesRepo(db),
    anchors: anchorsRepo(db),
    checkIns: checkInsRepo(db),
    sessions: sessionsRepo(db),
    settings: settingsRepo(db),
    plans: plansRepo(db)
  }
}

export type Repositories = ReturnType<typeof createRepositories>
export { NotFoundError } from './errors'
