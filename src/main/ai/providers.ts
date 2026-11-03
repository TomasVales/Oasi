import Anthropic from '@anthropic-ai/sdk'

export interface StreamRequest {
  system: string
  prompt: string
  maxTokens: number
  signal: AbortSignal
  onText: (delta: string) => void
}

export interface StreamResult {
  text: string
  /** Modelo que efectivamente respondió (puede diferir si actuó el fallback del servidor). */
  model: string
}

export interface AiProviderClient {
  stream(req: StreamRequest): Promise<StreamResult>
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate_limit' | 'refusal' | 'connection' | 'config' | 'other'
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/** Claude vía la API de Anthropic, con streaming y fallback del lado del servidor ante rechazos. */
export class AnthropicProvider implements AiProviderClient {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string,
    opts: { baseURL?: string } = {}
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) })
  }

  async stream({ system, prompt, maxTokens, signal, onText }: StreamRequest): Promise<StreamResult> {
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: maxTokens,
          // Tareas cortas de explicación: esfuerzo bajo = respuesta rápida y barata.
          output_config: { effort: 'low' },
          // Si un clasificador de seguridad rechaza el pedido, el servidor reintenta con otro modelo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          messages: [{ role: 'user', content: prompt }]
        },
        { signal }
      )
      let text = ''
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text
          onText(event.delta.text)
        }
      }
      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') {
        throw new AiError('El modelo no pudo responder este pedido.', 'refusal')
      }
      return { text, model: final.model }
    } catch (err) {
      throw mapAnthropicError(err)
    }
  }
}

function mapAnthropicError(err: unknown): Error {
  if (err instanceof AiError) return err
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new AiError('La API key de Anthropic no es válida o no tiene permisos.', 'auth')
  if (err instanceof Anthropic.RateLimitError) return new AiError('Límite de uso alcanzado. Probá en unos minutos.', 'rate_limit')
  if (err instanceof Anthropic.NotFoundError) return new AiError('El modelo configurado no existe.', 'config')
  if (err instanceof Anthropic.APIConnectionError) return new AiError('No hay conexión con la API de Anthropic.', 'connection')
  if (err instanceof Anthropic.APIUserAbortError) return new AiError('Cancelado.', 'other')
  if (err instanceof Anthropic.APIError) return new AiError(`Error de la API (${err.status}).`, 'other')
  return err instanceof Error ? err : new Error(String(err))
}

/** Modelo local con Ollama (funciona sin internet y sin enviar texto a terceros). */
export class OllamaProvider implements AiProviderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async stream({ system, prompt, signal, onText, maxTokens }: StreamRequest): Promise<StreamResult> {
    if (!this.model) throw new AiError('Elegí un modelo de Ollama en Ajustes.', 'config')
    let res: Response
    try {
      res = await this.fetchImpl(new URL('/api/chat', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          options: { num_predict: maxTokens },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ]
        }),
        signal
      })
    } catch (err) {
      if (signal.aborted) throw new AiError('Cancelado.', 'other')
      throw new AiError(`No se pudo conectar con Ollama en ${this.baseUrl}. ¿Está abierto?`, 'connection')
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      throw new AiError(`Ollama respondió ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, res.status === 404 ? 'config' : 'other')
    }

    // Respuesta NDJSON: un objeto JSON por línea.
    const decoder = new TextDecoder()
    const reader = res.body.getReader()
    let buffer = ''
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const msg = JSON.parse(line) as { message?: { content?: string }; error?: string }
        if (msg.error) throw new AiError(`Ollama: ${msg.error}`, 'other')
        const delta = msg.message?.content ?? ''
        if (delta) {
          text += delta
          onText(delta)
        }
      }
    }
    return { text, model: this.model }
  }
}

export async function listOllamaModels(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(new URL('/api/tags', baseUrl), { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string }[] }
    return (data.models ?? []).map((m) => m.name).sort()
  } catch {
    return []
  }
}
