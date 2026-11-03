import { useCallback, useEffect, useRef } from 'react'

/**
 * Debounce con `flush` (ejecuta ya lo pendiente) y flush automático al desmontar,
 * para no perder el último cambio al cambiar de apunte o cerrar la vista.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<number | null>(null)
  const pending = useRef<A | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const args = pending.current
    pending.current = null
    if (args) fnRef.current(...args)
  }, [])

  const call = useCallback(
    (...args: A) => {
      pending.current = args
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, ms)
    },
    [flush, ms]
  )

  useEffect(() => flush, [flush])
  return { call, flush }
}
