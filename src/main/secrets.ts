import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'

/** Cifrado provisto por el sistema (Keychain en macOS, DPAPI en Windows, libsecret en Linux). */
export interface Cipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export type SecretKey = 'anthropic.apiKey' | 'google.clientSecret' | 'google.refreshToken'

/**
 * Secretos cifrados en un archivo aparte de la DB. Nunca se envían al renderer:
 * la UI solo sabe si cada secreto existe.
 */
export class SecretStore {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher
  ) {}

  private readAll(): Record<string, string> {
    if (!existsSync(this.file)) return {}
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private writeAll(data: Record<string, string>) {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
    renameSync(tmp, this.file) // escritura atómica
  }

  get(key: SecretKey): string | null {
    const raw = this.readAll()[key]
    if (!raw || !this.cipher.isAvailable()) return null
    try {
      return this.cipher.decrypt(Buffer.from(raw, 'base64'))
    } catch {
      return null
    }
  }

  has(key: SecretKey): boolean {
    return key in this.readAll()
  }

  set(key: SecretKey, value: string): void {
    if (!this.cipher.isAvailable()) {
      throw new Error('El sistema no ofrece almacenamiento cifrado; no se puede guardar la credencial de forma segura')
    }
    const all = this.readAll()
    all[key] = this.cipher.encrypt(value).toString('base64')
    this.writeAll(all)
  }

  delete(key: SecretKey): void {
    const all = this.readAll()
    if (!(key in all)) return
    delete all[key]
    this.writeAll(all)
  }
}
