import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router'
import { buildPresence, DEFAULT_DISCORD, type DiscordSettings, type PresenceActivity, type Section } from '@shared/discord'
import { toLocalDate } from '@shared/domain'
import { studyModeLabel } from '@shared/planner'
import { activeSeconds } from '@shared/timer'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { useSettings, useStreak } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { useSession } from '@/features/session/SessionProvider'
import { flashcardsKey } from '@/features/review/ReviewPage'

const APP_STARTED_AT = Date.now()

const SECTIONS: [string, Section][] = [
  ['/calendario', 'calendar'],
  ['/estudio', 'study'],
  ['/materias', 'subjects'],
  ['/estadisticas', 'stats'],
  ['/repaso', 'review'],
  ['/ajustes', 'settings']
]

/** La actividad de Discord que corresponde a este momento (con `override`, para previsualizar ajustes). */
export function usePresence(override?: DiscordSettings): PresenceActivity {
  const { session, now } = useSession()
  const { data: settings } = useSettings()
  const { data: subjects } = useSubjects()
  const { data: streak } = useStreak()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const cfg = override ?? settings?.discord ?? DEFAULT_DISCORD
  const section = SECTIONS.find(([p]) => pathname.startsWith(p))?.[1] ?? 'home'
  const subjectId = params.get('subject')
  const docId = section === 'study' ? params.get('doc') : null
  const noteId = section === 'study' ? params.get('note') : null

  const doc = useQuery({ queryKey: ['document', docId], queryFn: () => api.documents.get(docId!), enabled: !!docId && cfg.showTitles })
  const note = useQuery({ queryKey: ['note', noteId], queryFn: () => api.notes.get(noteId!), enabled: !!noteId && cfg.showTitles, staleTime: 30_000 })
  const deck = useQuery({ queryKey: flashcardsKey(subjectId), queryFn: () => api.flashcards.deck(subjectId), enabled: section === 'review', staleTime: 60_000 })
  const today = toLocalDate()
  const todayStats = useQuery({
    queryKey: queryKeys.statsRange(today, today, null),
    queryFn: () => api.stats.range(today, today),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  })

  const nameOf = (id: string | null) => subjects?.find((s) => s.id === id)?.name ?? null
  const t = session?.timer

  return buildPresence({
    settings: cfg,
    session:
      session && t
        ? {
            subjectName: nameOf(session.subjectId),
            modeLabel: session.mode ? studyModeLabel(session.mode) : null,
            phase: t.phase,
            running: t.runningSince !== null,
            phaseEndsAt: t.runningSince !== null ? t.runningSince + t.phaseDurationMs - t.phaseElapsedMs : null,
            focusedSeconds: activeSeconds(t, now),
            cycle: t.cycle,
            focusMinutes: t.config.focusMinutes,
            plannedMinutes: t.config.plannedMinutes
          }
        : null,
    view: {
      section,
      subjectName: nameOf(subjectId),
      docTitle: doc.data?.title ?? null,
      noteTitle: note.data?.title ?? null
    },
    streak: streak?.current ?? 0,
    todaySeconds: todayStats.data?.daily[0]?.seconds ?? 0,
    dueCards: deck.data?.due.length ?? 0,
    appStartedAt: APP_STARTED_AT
  })
}
