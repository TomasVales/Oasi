import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Cloud, HardDrive, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import type { AiProvider, AiSettings as AiSettingsT } from '@shared/settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'

const PROVIDERS: { value: AiProvider; label: string; hint: string; icon: typeof Bot }[] = [
  { value: 'none', label: 'Desactivada', hint: 'Sin asistente', icon: Bot },
  { value: 'anthropic', label: 'Claude (API)', hint: 'Mejor calidad · requiere API key', icon: Cloud },
  { value: 'ollama', label: 'Ollama (local)', hint: 'Privado y offline', icon: HardDrive }
]

export function AiSettingsSection() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.ai.status() })
  const [draft, setDraft] = useState<AiSettingsT | null>(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  useEffect(() => {
    if (settings && !draft) setDraft(settings.ai)
  }, [settings, draft])

  const models = useQuery({
    queryKey: ['ai', 'ollamaModels', draft?.ollamaUrl],
    queryFn: () => api.ai.listOllamaModels(draft!.ollamaUrl),
    enabled: draft?.provider === 'ollama' && /^https?:\/\//.test(draft.ollamaUrl)
  })

  if (!draft) return null

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ai'] })
    void qc.invalidateQueries({ queryKey: queryKeys.settings })
  }

  const save = async (next: AiSettingsT) => {
    setDraft(next)
    setMsg(null)
    try {
      await api.settings.set('ai', next)
      refresh()
    } catch (err) {
      setMsg({ ok: false, text: ipcErrorMessage(err) })
    }
  }

  const saveKey = async (value: string | null) => {
    try {
      await api.ai.setApiKey(value)
      setKey('')
      refresh()
      setMsg(value ? { ok: true, text: 'API key guardada (cifrada en tu equipo).' } : null)
    } catch (err) {
      setMsg({ ok: false, text: ipcErrorMessage(err) })
    }
  }

  const test = async () => {
    setTesting(true)
    setMsg(null)
    try {
      const { done } = api.ai.run({ task: 'simplify', text: 'La derivada de una función en un punto mide su tasa de cambio instantánea.' }, () => {})
      const r = await done
      setMsg({ ok: true, text: `Funciona (${r.model}): “${r.text.slice(0, 120).replace(/\s+/g, ' ')}…”` })
    } catch (err) {
      setMsg({ ok: false, text: ipcErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Asistente de IA</h2>
        <p className="text-xs text-fg-muted">
          Simplifica o resume párrafos y da consejos sobre tu plan de lectura. No genera simulacros ni preguntas de examen.
        </p>
      </div>
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Proveedor de IA">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              role="radio"
              aria-checked={draft.provider === p.value}
              onClick={() => void save({ ...draft, provider: p.value })}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-card border-2 px-3 py-2 text-left',
                draft.provider === p.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <p.icon size={14} /> {p.label}
              </span>
              <span className="text-[11px] text-fg-muted">{p.hint}</span>
            </button>
          ))}
        </div>

        {draft.provider === 'anthropic' && (
          <div className="space-y-3">
            <Field label="Modelo" hint="Por defecto, Claude Opus 5.5 con esfuerzo bajo (respuestas rápidas).">
              <Input
                value={draft.anthropicModel}
                onChange={(e) => setDraft({ ...draft, anthropicModel: e.target.value })}
                onBlur={() => void save(draft)}
              />
            </Field>
            <Field group label="API key de Anthropic" hint="Se guarda cifrada con el llavero del sistema y nunca sale del proceso principal. El texto que pidas simplificar se envía a Anthropic.">
              {status.data?.hasApiKey ? (
                <div className="flex items-center gap-2 text-sm">
                  <KeyRound size={14} className="text-success" /> Guardada
                  <span className="flex-1" />
                  <Button size="sm" variant="danger" onClick={() => void saveKey(null)}>
                    Borrar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} className="flex-1" autoComplete="off" />
                  <Button variant="primary" disabled={key.trim().length < 10} onClick={() => void saveKey(key.trim())}>
                    Guardar
                  </Button>
                </div>
              )}
            </Field>
          </div>
        )}

        {draft.provider === 'ollama' && (
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <Field label="Dirección de Ollama">
              <Input value={draft.ollamaUrl} onChange={(e) => setDraft({ ...draft, ollamaUrl: e.target.value })} onBlur={() => void save(draft)} />
            </Field>
            <Field group
              label="Modelo"
              hint={models.data && !models.data.length ? 'No se encontraron modelos. Instalá Ollama y corré: ollama pull llama3.2' : undefined}
            >
              <div className="flex gap-1">
                <select
                  value={draft.ollamaModel}
                  onChange={(e) => void save({ ...draft, ollamaModel: e.target.value })}
                  className="h-9 min-w-0 flex-1 rounded-card border border-line bg-canvas px-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">Elegí un modelo</option>
                  {(models.data ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Button size="icon" variant="ghost" title="Actualizar lista" onClick={() => void models.refetch()}>
                  <RefreshCw size={14} className={cn(models.isFetching && 'animate-spin')} />
                </Button>
              </div>
            </Field>
          </div>
        )}

        {draft.provider !== 'none' && (
          <div className="flex items-start gap-3">
            <Button variant="secondary" size="sm" onClick={() => void test()} disabled={testing || !status.data?.configured}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Probar
            </Button>
            {msg && <p className={cn('min-w-0 flex-1 pt-1 text-xs', msg.ok ? 'text-success' : 'text-danger')}>{msg.text}</p>}
          </div>
        )}
      </Card>
    </section>
  )
}
