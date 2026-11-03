import { QueryClient } from '@tanstack/react-query'

/**
 * Los datos son locales (SQLite vía IPC): no hay red, así que no tiene sentido
 * reintentar ni refrescar al enfocar la ventana. Se invalida a mano tras mutar.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false }
  }
})

export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  settings: ['settings'] as const,
  subjects: (includeArchived = false) => ['subjects', { includeArchived }] as const,
  subjectsAll: ['subjects'] as const,
  documents: (subjectId: string) => ['documents', subjectId] as const,
  folders: (subjectId: string) => ['folders', subjectId] as const,
  notes: (subjectId: string) => ['notes', 'bySubject', subjectId] as const,
  note: (id: string) => ['notes', 'byId', id] as const,
  anchors: (documentId: string) => ['anchors', documentId] as const,
  events: ['events'] as const,
  checkInToday: ['checkIns', 'today'] as const,
  plan: ['planner'] as const,
  streak: ['stats', 'streak'] as const,
  statsRange: (from: string, to: string, subjectId: string | null) => ['stats', 'range', from, to, subjectId] as const,
  stats: ['stats'] as const
}
