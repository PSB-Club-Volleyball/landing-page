import type { Env } from '../_lib/env'
import { parseCookies, serializeCookie, SESSION_COOKIE } from '../_lib/cookies'
import { sha256Hex } from '../_lib/crypto'
import { json } from '../_lib/http'

// POST /api/auth/logout -> revokes the session server-side, not just the cookie
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cookies = parseCookies(request.headers.get('cookie'))
  const token = cookies[SESSION_COOKIE]

  if (token) {
    const tokenHash = await sha256Hex(token)
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(tokenHash).run()
  }

  const headers = new Headers()
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, path: '/' }))
  return json({ ok: true }, { headers })
}
