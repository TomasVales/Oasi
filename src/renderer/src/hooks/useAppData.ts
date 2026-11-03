import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'

export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings.getAll() })

export const useStreak = () => useQuery({ queryKey: queryKeys.streak, queryFn: () => api.stats.streak(), staleTime: 60_000 })

export const useCheckInToday = () =>
  useQuery({ queryKey: queryKeys.checkInToday, queryFn: () => api.checkIns.today(), staleTime: 60_000 })

export const usePlan = (at?: Date | null) =>
  useQuery({
    queryKey: [...queryKeys.plan, at?.getTime() ?? 'now'],
    // Hoy: el plan guardado (con progreso). Otro momento (p. ej. mañana): sugerencia sin guardar.
    queryFn: () => (at ? api.planner.suggest({ at }) : api.planner.today()),
    staleTime: 60_000
  })

/** Próximos eventos (60 días), incluidas clases: para cuenta regresiva y badges del riel. */
export const useUpcomingEvents = () =>
  useQuery({
    queryKey: [...queryKeys.events, 'upcoming60'],
    queryFn: () => {
      const from = new Date()
      return api.events.listRange({ from, to: new Date(from.getTime() + 60 * 86_400_000) })
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000
  })
