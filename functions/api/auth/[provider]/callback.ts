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
  const isBootstrap = bootstrapEmails.includes(profile.email)

  // If a bootstrap email is signing in and nobody holds the owner role yet, this
  // login claims it — self-healing in the same spirit as the approval re-check
  // below, so a fresh deploy or a wiped owner never needs a manual data patch.
  let assignOwner = false
  if (isBootstrap) {
    const owner = await env.DB.prepare(`SELECT id FROM users WHERE role = 'owner'`).first<{ id: number }>()
    assignOwner = !owner
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE provider = ?1 AND provider_sub = ?2`
  )
    .bind(providerName, profile.sub)
    .first<{ id: number }>()

  let userId: number
  if (existing) {
    userId = existing.id
    // Re-approve on every login, not just at account creation — otherwise a
    // bootstrap email that landed as `pending` before it was added to (or
    // corrected in) ADMIN_BOOTSTRAP_EMAILS stays stuck pending forever, with
    // no other approved admin able to unstick it.
    if (isBootstrap) {
      const approve = () =>
        env.DB.prepare(
          `UPDATE users SET name = ?1, avatar_url = ?2, email = ?3, status = 'approved',
                  decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP)${assignOwner ? `, role = 'owner'` : ''}
           WHERE id = ?4`
        )
          .bind(profile.name, profile.picture, profile.email, userId)
          .run()
      try {
        await approve()
      } catch (e) {
        // Lost the race to claim the owner role — another concurrent bootstrap
        // login won it between our "no owner yet" check and this write. That
        // login is still otherwise valid, so retry once as a normal approved
        // user instead of failing it; a genuinely different failure will still
        // throw on retry since assignOwner no longer applies.
        if (!assignOwner) throw e
        assignOwner = false
        await approve()
      }
    } else {
      await env.DB.prepare(`UPDATE users SET name = ?1, avatar_url = ?2, email = ?3 WHERE id = ?4`)
        .bind(profile.name, profile.picture, profile.email, userId)
        .run()
    }
  } else {
    const insert = () =>
      env.DB.prepare(
        `INSERT INTO users (email, name, avatar_url, provider, provider_sub, status, decided_at, role)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
        .bind(
          profile.email,
          profile.name,
          profile.picture,
          providerName,
          profile.sub,
          isBootstrap ? 'approved' : 'pending',
          isBootstrap ? new Date().toISOString() : null,
          assignOwner ? 'owner' : 'member'
        )
        .run()
    let inserted
    try {
      inserted = await insert()
    } catch (e) {
      // Same race as above, for a brand-new bootstrap-email user.
      if (!assignOwner) throw e
      assignOwner = false
      inserted = await insert()
    }
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
