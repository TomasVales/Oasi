import { useEffect, useState } from 'react'

/** Preferencias de UI efímeras (ej. barra colapsada). Lo importante va a SQLite, no aquí. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  }, [key, value])
  return [value, setValue] as const
}
