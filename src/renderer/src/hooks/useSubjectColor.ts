import { useCallback } from 'react'
import { resolveSubjectColor } from '@shared/subjectColors'
import { useTheme } from '@/theme/ThemeProvider'

/** Devuelve el color de materia escalonado para el tema actual (claro u oscuro). */
export function useSubjectColor() {
  const { theme } = useTheme()
  const dark = theme !== 'zen'
  return useCallback((stored: string) => resolveSubjectColor(stored, dark), [dark])
}
