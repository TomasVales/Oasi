import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'drizzle-kit'

/** Ruta de la DB de desarrollo (para `npm run db:studio`). Override con STUDENT_OS_DB. */
function devDbPath(): string {
  const appData =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? (process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'))
        : (process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'))
  return join(appData, 'Student OS (dev)', 'student-os.db')
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env['STUDENT_OS_DB'] ?? devDbPath() }
})
