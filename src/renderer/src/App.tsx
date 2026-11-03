import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { HashRouter, Route, Routes } from 'react-router'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { SessionProvider } from '@/features/session/SessionProvider'
import { SoundscapeProvider } from '@/features/sound/SoundscapeProvider'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { StatsPage } from '@/pages/StatsPage'
import { WorkspacePage } from '@/features/workspace/WorkspacePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SubjectsPage } from '@/pages/SubjectsPage'

/** HashRouter: la app se carga desde file:// en producción, donde no hay History API con rutas reales. */
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
        <SoundscapeProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="calendario" element={<CalendarPage />} />
              <Route path="estudio" element={<WorkspacePage />} />
              <Route path="materias" element={<SubjectsPage />} />
              <Route path="estadisticas" element={<StatsPage />} />
              <Route path="ajustes" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
        </SoundscapeProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </MotionConfig>
  )
}
