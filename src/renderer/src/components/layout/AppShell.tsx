import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { Outlet, useLocation, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { page } from '@/lib/motion'
import { AwayScreen } from '@/features/away/AwayScreen'
import { FocusOverlay } from '@/features/focus/FocusOverlay'
import { SessionReflection } from '@/features/session/SessionReflection'
import { BackgroundLayer } from '@/features/background/BackgroundLayer'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { AnimatePresence } from 'framer-motion'
import { useSettings } from '@/hooks/useAppData'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useSubjects } from '@/hooks/useSubjects'
import { CheckInModal } from '@/features/checkin/CheckInModal'
import { navForPath } from '@/navigation'
import { ChannelSidebar } from './ChannelSidebar'
import { CountdownPill } from './Countdown'
import { ServerRail } from './ServerRail'

const SUBJECT_SECTION: Record<string, string> = { '/estudio': 'Estudio', '/calendario': 'Fechas', '/estadisticas': 'Progreso' }

export function AppShell() {
  const [hidden, setHidden] = usePersistentState('ui.channelsHidden', false)
  const toggleSidebar = useCallback(() => setHidden((c) => !c), [setHidden])
  useGlobalShortcuts({ toggleSidebar })

  // Cambios hechos por el main (sincronización con Google) → refrescar lo que depende de eventos.
  const qc = useQueryClient()
  useEffect(
    () =>
      api.onDataChanged((scope) => {
        if (scope === 'events') {
          void qc.invalidateQueries({ queryKey: queryKeys.events })
          void qc.invalidateQueries({ queryKey: queryKeys.plan })
          void qc.invalidateQueries({ queryKey: ['google'] })
        }
      }),
    [qc]
  )

  const { data: settings } = useSettings()
  const needsOnboarding = !!settings && settings.onboarding.completedAt === null
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { data: subjects } = useSubjects()
  const subject = subjects?.find((s) => s.id === params.get('subject'))
  const nav = navForPath(pathname)
  const section = (subject && SUBJECT_SECTION[pathname]) || nav?.label
  const SectionIcon = nav?.icon
  const topic = subject ? subject.name : nav?.topic

  return (
    <div className="relative flex h-full bg-canvas text-fg">
      <BackgroundLayer />
      <ServerRail />
      {!hidden && <ChannelSidebar />}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <header className="shell-header drag-region relative z-10 flex h-12 shrink-0 items-center gap-2 px-4">
          {SectionIcon && <SectionIcon size={18} className="shrink-0 text-fg-subtle" />}
          <h1 className="shrink-0 font-display text-[15px] font-semibold">{section}</h1>
          {topic && (
            <>
              <span className="mx-1 h-6 w-px shrink-0 bg-line-strong" />
              <span className="truncate text-[13px] text-fg-muted">{topic}</span>
            </>
          )}
          <span className="flex-1" />
          <div className="no-drag">
            <CountdownPill />
          </div>
        </header>
        <main className="min-h-0 flex-1">
          {/* La clave es la sección (no la query): cambiar de PDF no re-anima toda la pantalla. */}
          <motion.div key={pathname} className="h-full" variants={page} initial="hidden" animate="visible">
            <Outlet />
          </motion.div>
        </main>
      </div>
      {!needsOnboarding && settings && <CheckInModal />}
      <FocusOverlay />
      <SessionReflection />
      <AwayScreen />
      <AnimatePresence>{needsOnboarding && <Onboarding key="onboarding" />}</AnimatePresence>
    </div>
  )
}
