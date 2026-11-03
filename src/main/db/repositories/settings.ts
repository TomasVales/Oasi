import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { settings } from '../schema'
import { DEFAULT_SETTINGS, type AppSettings, type SettingKey } from '@shared/settings'

export function settingsRepo(db: Db) {
  return {
    get<K extends SettingKey>(key: K): AppSettings[K] {
      const row = db.select().from(settings).where(eq(settings.key, key)).get()
      return (row?.value as AppSettings[K] | undefined) ?? DEFAULT_SETTINGS[key]
    },

    getAll(): AppSettings {
      const stored = Object.fromEntries(db.select().from(settings).all().map((r) => [r.key, r.value]))
      return { ...DEFAULT_SETTINGS, ...stored } as AppSettings
    },

    set<K extends SettingKey>(key: K, value: AppSettings[K]): void {
      db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
        .run()
    }
  }
}
