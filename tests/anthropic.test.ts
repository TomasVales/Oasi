import { strict as assert } from 'node:assert'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { AnthropicProvider } from '../src/main/ai/providers'

/** Servidor que habla el protocolo SSE de /v1/messages (sin red ni costo). */
let server: Server
let baseURL: string
let lastBody: Record<string, unknown> = {}
let lastHeaders: Record<string, string | string[] | undefined> = {}
let mode: 'ok' | 'refusal' | 'unauthorized' = 'ok'

function sse(res: import('node:http').ServerResponse, events: [string, unknown][]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  res.end()
}

before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      lastBody = JSON.parse(body)
      lastHeaders = req.headers
      if (mode === 'unauthorized') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
        return
      }
      const msg = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } }
      const deltas = mode === 'ok' ? ['La idea ', 'central es simple.'] : []
      sse(res, [
        ['message_start', { type: 'message_start', message: msg }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ...deltas.map((t): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }]),
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: mode === 'ok' ? 'end_turn' : 'refusal', stop_sequence: null }, usage: { output_tokens: 7 } }],
        ['message_stop', { type: 'message_stop' }]
      ])
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const run = (deltas: string[] = []) =>
  new AnthropicProvider('sk-ant-test', 'claude-opus-5-5', { baseURL }).stream({
    system: 'sys',
    prompt: 'explicá',
    maxTokens: 1000,
    signal: new AbortController().signal,
    onText: (d) => deltas.push(d)
  })

describe('proveedor Anthropic (SDK real contra API simulada)', () => {
  it('transmite el texto y envía modelo, esfuerzo bajo y fallback del servidor', async () => {
    mode = 'ok'
    const deltas: string[] = []
    const r = await run(deltas)
    assert.equal(r.text, 'La idea central es simple.')
    assert.deepEqual(deltas, ['La idea ', 'central es simple.'])
    assert.equal(lastBody['model'], 'claude-opus-5-5')
    assert.deepEqual(lastBody['output_config'], { effort: 'low' })
    assert.equal(lastBody['fallbacks'], 'default')
    assert.equal(lastBody['stream'], true)
    assert.match(String(lastHeaders['anthropic-beta']), /server-side-fallback-2026-07-01/)
    assert.equal(lastBody['thinking'], undefined) // Opus 5.5: pensamiento adaptativo por defecto
  })
  it('un rechazo se informa con un mensaje claro', async () => {
    mode = 'refusal'
    await assert.rejects(run(), /no pudo responder/)
  })
  it('API key inválida → error de autenticación en español', async () => {
    mode = 'unauthorized'
    await assert.rejects(run(), /API key de Anthropic no es válida/)
  })
})
