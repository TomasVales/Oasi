/** Electron envuelve los errores del main: "Error invoking remote method 'x': Error: …". */
export function ipcErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '').replace(/^\[[^\]]+\]\s*/, '')
}
