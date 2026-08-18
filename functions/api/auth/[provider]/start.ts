import type { Env } from '../../_lib/env'
import { serializeCookie, OAUTH_STATE_COOKIE } from '../../_lib/cookies'
import { randomToken } from '../../_lib/crypto'
import { getProvider } from '../_lib/providers'

// GET /api/auth/:provider/start -> redirects to the provider's consent screen (Google only)
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const providerName = String(params.provider)
  const provider = getProvider(providerName, env)
  if (!provider) return new Response('Unknown auth provider', { status: 404 })

  const state = randomToken(16)
  const redirectUri = `${env.PUBLIC_URL}/api/auth/${providerName}/callback`

  const authorizeUrl = new URL(provider.authUrl)
  authorizeUrl.searchParams.set('client_id', provider.clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', provider.scope)
  authorizeUrl.searchParams.set('state', state)
  if (providerName === 'google') {
    authorizeUrl.searchParams.set('access_type', 'online')
    authorizeUrl.searchParams.set('prompt', 'select_account')
  }

  const headers = new Headers({ Location: authorizeUrl.toString() })
  headers.append(
    'Set-Cookie',
    serializeCookie(OAUTH_STATE_COOKIE, state, { maxAge: 600, path: '/api/auth' })
  )
  return new Response(null, { status: 302, headers })
}
