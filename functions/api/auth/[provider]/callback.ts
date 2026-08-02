import type { Env } from '../../_lib/env'
import { parseCookies, serializeCookie, OAUTH_STATE_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../_lib/cookies'
import { randomToken, sha256Hex } from '../../_lib/crypto'
import { getProvider, normalizeProfile } from '../_lib/providers'

// GET /api/auth/:provider/callback -> exchanges the auth code, upserts the
// user (pending unless they're in ADMIN_BOOTSTRAP_EMAILS), opens a session.
export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const providerName = String(params.provider)
  const provider = getProvider(providerName, env)
  if (!provider) return new Response('Unknown auth provider', { status: 404 })

  const toAdmin = (query = '') =>
    new Response(null, {
      status: 302,
      headers: { Location: `${env.PUBLIC_URL}/admin${query ? `?${query}` : ''}` },
    })

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookies = parseCookies(request.headers.get('cookie'))

  if (!code || !state || !cookies[OAUTH_STATE_COOKIE] || cookies[OAUTH_STATE_COOKIE] !== state) {
    return toAdmin('error=invalid_state')
  }

  const redirectUri = `${env.PUBLIC_URL}/api/auth/${providerName}/callback`
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenResponse.ok) return toAdmin('error=token_exchange_failed')
  const tokenData = await tokenResponse.json<{ access_token: string }>()

  const profileResponse = await fetch(provider.userinfoUrl, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!profileResponse.ok) return toAdmin('error=profile_fetch_failed')
  const profile = normalizeProfile(await profileResponse.json<Record<string, unknown>>())
  if (!profile) return toAdmin('error=missing_profile_fields')

  const bootstrapEmails = env.ADMIN_BOOTSTRAP_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE provider = ?1 AND provider_sub = ?2`
  )
    .bind(providerName, profile.sub)
    .first<{ id: number }>()

  let userId: number
  if (existing) {
    userId = existing.id
    await env.DB.prepare(`UPDATE users SET name = ?1, avatar_url = ?2, email = ?3 WHERE id = ?4`)
      .bind(profile.name, profile.picture, profile.email, userId)
      .run()
  } else {
    const autoApprove = bootstrapEmails.includes(profile.email)
    const inserted = await env.DB.prepare(
      `INSERT INTO users (email, name, avatar_url, provider, provider_sub, status, decided_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
      .bind(
        profile.email,
        profile.name,
        profile.picture,
        providerName,
        profile.sub,
        autoApprove ? 'approved' : 'pending',
        autoApprove ? new Date().toISOString() : null
      )
      .run()
    userId = Number(inserted.meta.last_row_id)
  }

  const sessionToken = randomToken(32)
  const tokenHash = await sha256Hex(sessionToken)
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  await env.DB.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?1, ?2, ?3)`)
    .bind(userId, tokenHash, expiresAt)
    .run()

  const headers = new Headers({ Location: `${env.PUBLIC_URL}/admin` })
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_SECONDS, path: '/' }))
  headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, path: '/api/auth' }))
  return new Response(null, { status: 302, headers })
}
