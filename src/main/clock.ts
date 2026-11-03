import { app } from 'electron'

/**
 * Reloj del proceso principal. En desarrollo, STUDENT_OS_CLOCK_OFFSET_MS desplaza la hora
 * (se lee en cada llamada) para probar flujos que dependen del horario, como el atraso del
 * plan. En la app empaquetada se ignora siempre.
 */
export function now(): Date {
  const raw = app.isPackaged ? undefined : process.env['STUDENT_OS_CLOCK_OFFSET_MS']
  const offset = raw ? Number(raw) || 0 : 0
  return new Date(Date.now() + offset)
}
