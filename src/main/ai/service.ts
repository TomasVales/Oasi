import type { AiRunInput } from '@shared/validation'
import type { AiSettings } from '@shared/settings'
import type { SecretStore } from '../secrets'
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts'
import { AiError, AnthropicProvider, OllamaProvider, type AiProviderClient } from './providers'

import type { AiEvent, AiStatus } from '@shared/ipc'
export type { AiEvent, AiStatus }

const MAX_TOKENS: Record<AiRunInput['task'], number> = { simplify: 4000, summarize: 2000, 'reading-advice': 1500 }

export class AiService {
  private readonly running = new Map<string, AbortController>()

  constructor(
    private readonly getSettings: () => AiSettings,
    private readonly secrets: SecretStore,
    private readonly makeProvider: (s: AiSettings, apiKey: string | null) => AiProviderClient = defaultProvider
  ) {}

  status(): AiStatus {
    const s = this.getSettings()
    const hasApiKey = this.secrets.has('anthropic.apiKey')
    const configured = s.provider === 'anthropic' ? hasApiKey : s.provider === 'ollama' ? !!s.ollamaModel : false
    return { provider: s.provider, configured, model: s.provider === 'ollama' ? s.ollamaModel : s.anthropicModel, hasApiKey }
  }

  /** Corre una tarea y emite eventos de streaming. Nunca lanza: los errores llegan como evento. */
  async run(requestId: string, input: AiRunInput, emit: (e: AiEvent) => void): Promise<void> {
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const settings = this.getSettings()
      if (settings.provider === 'none') throw new AiError('Activá un proveedor de IA en Ajustes.', 'config')
      const provider = this.makeProvider(settings, this.secrets.get('anthropic.apiKey'))
      const result = await provider.stream({
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(input),
        maxTokens: MAX_TOKENS[input.task],
        signal: controller.signal,
        onText: (text) => emit({ requestId, type: 'delta', text })
      })
      emit({ requestId, type: 'done', text: result.text, model: result.model })
    } catch (err) {
      const e = err instanceof AiError ? err : new AiError(err instanceof Error ? err.message : String(err), 'other')
      emit({ requestId, type: 'error', message: controller.signal.aborted ? 'Cancelado.' : e.message, kind: e.kind })
    } finally {
      this.running.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }
}

function defaultProvider(s: AiSettings, apiKey: string | null): AiProviderClient {
  if (s.provider === 'anthropic') {
    if (!apiKey) throw new AiError('Cargá tu API key de Anthropic en Ajustes.', 'config')
    return new AnthropicProvider(apiKey, s.anthropicModel)
  }
  return new OllamaProvider(s.ollamaUrl, s.ollamaModel)
}
