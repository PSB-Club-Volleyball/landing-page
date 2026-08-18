import type { Env } from '../../_lib/env'

export type ProviderName = 'google'

export interface ProviderConfig {
  authUrl: string
  tokenUrl: string
  userinfoUrl: string
  scope: string
  clientId: string
  clientSecret: string
}

export function getProvider(name: string, env: Env): ProviderConfig | null {
  if (name === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      scope: 'openid email profile',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
  return null
}

export interface OAuthProfile {
  sub: string
  email: string
  name: string | null
  picture: string | null
}

export function normalizeProfile(raw: Record<string, unknown>): OAuthProfile | null {
  const sub = raw.sub
  const email = raw.email
  if (!sub || !email) return null
  return {
    sub: String(sub),
    email: String(email).toLowerCase(),
    name: typeof raw.name === 'string' ? raw.name : null,
    picture: typeof raw.picture === 'string' ? raw.picture : null,
  }
}
