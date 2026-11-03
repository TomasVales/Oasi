import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

export interface DbHandle {
  db: Db
  close: () => void
}

/**
 * Abre (o crea) la base SQLite y aplica las migraciones pendientes.
 * No depende de Electron: los tests la usan con `:memory:`.
 */
export function openDatabase(filePath: string, migrationsFolder: string): DbHandle {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL') // lecturas concurrentes y escrituras más seguras ante cierres bruscos
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON') // SQLite las trae apagadas por defecto
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })

  return { db, close: () => sqlite.close() }
}
