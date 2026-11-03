import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'

const ago = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
function since(ms: number) {
  const min = Math.round((ms - Date.now()) / 60_000)
  return Math.abs(min) < 60 ? ago.format(min, 'minute') : ago.format(Math.round(min / 60), 'hour')
}

export function GoogleSettingsSection() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['google', 'status'], queryFn: () => api.google.status(), refetchInterval: 30_000 })
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const st = status.data
  const calendars = useQuery({ queryKey: ['google', 'calendars'], queryFn: () => api.google.listCalendars(), enabled: !!st?.connected })
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    if (st) setSelected(st.calendarIds)
  }, [st?.calendarIds.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name)
    setError(null)
    try {
      await fn()
      void qc.invalidateQueries({ queryKey: ['google'] })
      void qc.invalidateQueries({ queryKey: queryKeys.events })
      void qc.invalidateQueries({ queryKey: queryKeys.plan })
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (!st) return null
  const showForm = !st.hasCredentials || editing

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Google Calendar</h2>
        <p className="text-xs text-fg-muted">Importa tus clases (solo lectura) para bloquear esos horarios en el planificador. La app nunca modifica tu calendario.</p>
      </div>
      <Card className="space-y-4 p-4 text-sm">
        {showForm ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-fg-muted">
              <li>
                En{' '}
                <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Google Cloud Console <ExternalLink size={10} className="inline" />
                </a>
                , creá un proyecto y habilitá la <strong>Google Calendar API</strong>.
              </li>
              <li>Configurá la pantalla de consentimiento (tipo «Externo») y agregate como usuario de prueba.</li>
              <li>
                En <strong>Credenciales → Crear ID de cliente de OAuth</strong>, elegí tipo <strong>«App de escritorio»</strong>.
              </li>
              <li>Pegá acá el Client ID y el Client Secret.</li>
            </ol>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID">
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" autoComplete="off" />
              </Field>
              <Field label="Client Secret" hint="Se guarda cifrado en tu equipo.">
                <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!clientId.trim() || !clientSecret.trim() || !!busy}
                onClick={() =>
                  void act('save', async () => {
                    await api.google.saveCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
                    setEditing(false)
                    setClientSecret('')
                  })
                }
              >
                Guardar credenciales
              </Button>
              {editing && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </>
        ) : !st.connected ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-fg-muted">
              Credenciales listas. Al conectar se abre tu navegador para autorizar el acceso de solo lectura.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Cambiar credenciales
            </Button>
            <Button variant="primary" disabled={!!busy} onClick={() => void act('connect', () => api.google.connect())}>
              {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck2 size={14} />}
              {busy === 'connect' ? 'Esperando al navegador…' : 'Conectar con Google'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="font-medium">Conectado</span>
              <span className="text-fg-muted">
                {st.lastSyncAt ? `· última sincronización ${since(st.lastSyncAt)}` : '· todavía no sincronizó'}
              </span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void act('sync', () => api.google.sync())}>
                <RefreshCw size={13} className={cn(busy === 'sync' && 'animate-spin')} /> Sincronizar ahora
              </Button>
              <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void act('disconnect', () => api.google.disconnect())}>
                <LogOut size={13} /> Desconectar
              </Button>
            </div>
            <Field group label="Calendarios a importar" hint="Elegí los que tienen tus clases. Los eventos de día completo no bloquean el planificador.">
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-card border border-line p-2">
                {calendars.isLoading && <p className="text-xs text-fg-subtle">Cargando calendarios…</p>}
                {calendars.data?.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-hover">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={selected.includes(c.id) || (c.primary === true && selected.includes('primary'))}
                      onChange={(e) => {
                        const id = c.primary ? 'primary' : c.id
                        setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id && x !== c.id)))
                      }}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.backgroundColor ?? 'var(--fg-subtle)' }} />
                    <span className="truncate">{c.summary}</span>
                    {c.primary && <span className="text-[11px] text-fg-subtle">(principal)</span>}
                  </label>
                ))}
              </div>
            </Field>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy || selected.join('|') === st.calendarIds.join('|')}
              onClick={() => void act('calendars', () => api.google.setCalendars(selected))}
            >
              Guardar selección y sincronizar
            </Button>
          </>
        )}
        {(error || st.lastSyncError) && <p className="text-xs text-danger">{error ?? st.lastSyncError}</p>}
      </Card>
    </section>
  )
}
