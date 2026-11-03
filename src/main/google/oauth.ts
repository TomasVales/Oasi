import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const GOOGLE_ENDPOINTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3'
}
export type GoogleEndpoints = typeof GOOGLE_ENDPOINTS

/** Solo lectura: la app nunca modifica tu calendario. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function createPkce() {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; endpoints?: GoogleEndpoints }) {
  const url = new URL((p.endpoints ?? GOOGLE_ENDPOINTS).auth)
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline', // refresh token para sincronizar sin volver a pedir permiso
    prompt: 'consent',
    state: p.state
  }).toString()
  return url.toString()
}

async function postToken(endpoint: string, body: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string }
  if (!res.ok) {
    const reason = data.error_description ?? data.error ?? `HTTP ${res.status}`
    throw new GoogleAuthError(`Google rechazó la autorización: ${reason}`, data.error === 'invalid_grant')
  }
  return data
}

export class GoogleAuthError extends Error {
  /** true si el refresh token ya no sirve (revocado/expirado): hay que reconectar. */
  constructor(
    message: string,
    readonly needsReconnect = false
  ) {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

export function refreshAccessToken(
  p: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
  endpoints: GoogleEndpoints = GOOGLE_ENDPOINTS
) {
  return postToken(
    endpoints.token,
    { client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken, grant_type: 'refresh_token' },
    fetchImpl
  )
}

const PAGE = (title: string, body: string) => `<!doctype html><html lang="es"><meta charset="utf-8"><title>Oasi</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f7f7f5;color:#37352f">
<div style="text-align:center"><h1 style="font-size:20px">${title}</h1><p>${body}</p></div></body></html>`

/**
 * Flujo OAuth para apps de escritorio (RFC 8252): servidor HTTP efímero en 127.0.0.1 con
 * puerto aleatorio, PKCE y `state`. Abre el navegador del sistema y espera el código.
 */
export async function authorizeWithLoopback(p: {
  clientId: string
  clientSecret: string
  openBrowser: (url: string) => void | Promise<void>
  fetchImpl?: typeof fetch
  endpoints?: GoogleEndpoints
  timeoutMs?: number
}): Promise<TokenResponse> {
  const endpoints = p.endpoints ?? GOOGLE_ENDPOINTS
  const { verifier, challenge } = createPkce()
  const state = b64url(randomBytes(16))
  let server: Server | null = null

  try {
    const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new GoogleAuthError('Se agotó el tiempo para autorizar en el navegador.')), p.timeoutMs ?? 5 * 60_000)
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/') {
          res.writeHead(404).end()
          return
        }
        const error = url.searchParams.get('error')
        const got = url.searchParams.get('code')
        if (url.searchParams.get('state') !== state) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE('Solicitud inválida', 'Volvé a intentar desde Oasi.'))
          return
        }
        clearTimeout(timer)
        if (error || !got) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE('No se otorgó acceso', 'Podés cerrar esta pestaña.'))
          reject(new GoogleAuthError(error === 'access_denied' ? 'Cancelaste el acceso a Google Calendar.' : `Error de Google: ${error}`))
          return
        }
        res
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(PAGE('¡Listo! Calendario conectado', 'Podés cerrar esta pestaña y volver a Oasi.'))
        resolve({ code: got, redirectUri: `http://127.0.0.1:${(server!.address() as AddressInfo).port}` })
      })
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const port = (server!.address() as AddressInfo).port
        const authUrl = buildAuthUrl({ clientId: p.clientId, redirectUri: `http://127.0.0.1:${port}`, challenge, state, endpoints })
        Promise.resolve(p.openBrowser(authUrl)).catch(reject)
      })
    })

    const tokens = await postToken(
      endpoints.token,
      {
        client_id: p.clientId,
        client_secret: p.clientSecret,
        code: code.code,
        code_verifier: verifier,
        redirect_uri: code.redirectUri,
        grant_type: 'authorization_code'
      },
      p.fetchImpl ?? fetch
    )
    if (!tokens.refresh_token) throw new GoogleAuthError('Google no devolvió un refresh token. Quitá el acceso de la app en tu cuenta y reconectá.')
    return tokens
  } finally {
    ;(server as Server | null)?.close()
  }
}
