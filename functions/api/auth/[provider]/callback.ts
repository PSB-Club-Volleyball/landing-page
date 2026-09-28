import type { Env } from '../../_lib/env'
import {
  parseCookies,
  serializeCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../../_lib/cookies'
import { randomToken, sha256Hex } from '../../_lib/crypto'
import { getProvider, isPersonalMicrosoftAccount, normalizeProfile } from '../_lib/providers'
import { getLoginSettings, isProviderEnabled } from '../_lib/settings'
import { resolveSignIn } from '../_lib/accounts'

// GET /api/auth/:provider/callback -> exchanges the auth code, finds or
// creates the account (resolveSignIn: by login, else by a vouched-for email,
// else a new outsider — admin/owner for ADMIN_BOOTSTRAP_EMAILS), opens a
// session.
//
// Which provider vouched for the email matters: 'microsoft' is the PSU
// tenant, 'google' says so via email_verified, and 'microsoft-other' only
// lets personal accounts through (Microsoft owns those addresses). Only the
// first two can trigger ADMIN_BOOTSTRAP_EMAILS promotion.
export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const providerName = String(params.provider)
  const provider = getProvider(providerName, env)
  if (!provider) return new Response('Unknown auth provider', { status: 404 })

  // Re-checked here, not just at /start: a provider switched off while its
  // consent screen was open must not still complete a sign-in.
  const settings = await getLoginSettings(env)
  if (!isProviderEnabled(providerName, settings)) {
    return new Response('Sign-in with this provider is currently disabled', { status: 404 })
  }

  const url = new URL(request.url)
  const cookies = parseCookies(request.headers.get('cookie'))
  const requestedRedirect = cookies[OAUTH_REDIRECT_COOKIE]
  const redirectTarget = requestedRedirect && requestedRedirect.startsWith('/') ? requestedRedirect : '/admin'

  const clearOAuthCookies = (headers: Headers) => {
    headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, path: '/api/auth' }))
    headers.append('Set-Cookie', serializeCookie(OAUTH_REDIRECT_COOKIE, '', { maxAge: 0, path: '/api/auth' }))
  }

  const toRedirect = (query = '') => {
    const headers = new Headers({ Location: `${env.PUBLIC_URL}${redirectTarget}${query ? `?${query}` : ''}` })
    clearOAuthCookies(headers)
    return new Response(null, { status: 302, headers })
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state || !cookies[OAUTH_STATE_COOKIE] || cookies[OAUTH_STATE_COOKIE] !== state) {
    return toRedirect('error=invalid_state')
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
  if (!tokenResponse.ok) {
    console.error(
      `OAuth token exchange failed for ${providerName}`,
      tokenResponse.status,
      await tokenResponse.text().catch(() => '')
    )
    return toRedirect('error=token_exchange_failed')
  }
  const tokenData = await tokenResponse.json<{ access_token: string; id_token?: string }>()

  // A work/school tenant's admin can set a user's email to any address, so
  // /common would let someone claim another person's email. Personal accounts
  // are identified by the consumer tenant ID in the id_token (Graph's
  // userinfo doesn't carry tid). With the openid scope Microsoft always
  // returns an id_token, so a missing one is a real fault.
  if (providerName === 'microsoft-other') {
    if (!tokenData.id_token) throw new Error('microsoft-other token response had no id_token')
    if (!isPersonalMicrosoftAccount(tokenData.id_token)) return toRedirect('error=personal_accounts_only')
  }

  const profileResponse = await fetch(provider.userinfoUrl, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!profileResponse.ok) {
    console.error(
      `OAuth profile fetch failed for ${providerName}`,
      profileResponse.status,
      await profileResponse.text().catch(() => '')
    )
    return toRedirect('error=profile_fetch_failed')
  }
  const profile = normalizeProfile(await profileResponse.json<Record<string, unknown>>())
  if (!profile) return toRedirect('error=missing_profile_fields')
  if (providerName === 'google' && profile.emailVerified === false) return toRedirect('error=email_unverified')

  // Only the PSU tenant's own addresses: the tenant's email claim is an
  // editable directory attribute, and for guest users it's their outside
  // address, which PSU doesn't own.
  const emailIsAuthoritative =
    (providerName === 'microsoft' && profile.email.endsWith('@psu.edu')) ||
    (providerName === 'google' && profile.emailVerified === true)
  const bootstrapEmails = env.ADMIN_BOOTSTRAP_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const isBootstrap = emailIsAuthoritative && bootstrapEmails.includes(profile.email)

  const account = await resolveSignIn(env, { provider: providerName, profile, emailIsAuthoritative, isBootstrap })
  if ('error' in account) return toRedirect(`error=${account.error}`)
  const userId = account.userId

  const sessionToken = randomToken(32)
  const tokenHash = await sha256Hex(sessionToken)
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  await env.DB.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?1, ?2, ?3)`)
    .bind(userId, tokenHash, expiresAt)
    .run()

  const headers = new Headers({ Location: `${env.PUBLIC_URL}${redirectTarget}` })
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_SECONDS, path: '/' }))
  clearOAuthCookies(headers)
  return new Response(null, { status: 302, headers })
}
