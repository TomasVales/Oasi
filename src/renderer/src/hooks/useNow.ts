import { useEffect, useState } from 'react'

/** Fecha actual que se refresca cada `intervalMs` (para cuentas regresivas y relojes). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
