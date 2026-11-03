/** Formateos en español usados en toda la UI. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Horas con un decimal, compacto para ejes y etiquetas: "2,5 h". */
export function formatHours(seconds: number): string {
  const h = seconds / 3600
  return `${h.toLocaleString('es', { maximumFractionDigits: h < 10 ? 1 : 0 })} h`
}

/** mm:ss o h:mm:ss para el cronómetro. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Cuenta regresiva: "2d 04:12:33" o "04:12:33". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const rest = formatClock((total % 86_400) * 1000).padStart(8, '0')
  const hms = rest.length === 5 ? `00:${rest}` : rest
  return d > 0 ? `${d}d ${hms}` : hms
}

export const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
export const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })
export const longDayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

export function relativeDays(target: Date, now = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(target) - start(now)) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'
  return days > 0 ? `en ${days} días` : `hace ${-days} días`
}

export function initials(name: string, code?: string | null): string {
  if (code?.trim()) return code.trim().slice(0, 4).toUpperCase()
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w))
  const letters = (words.length ? words : name.split(/\s+/)).map((w) => w[0]).join('')
  return letters.slice(0, 3).toUpperCase()
}
