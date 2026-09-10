import type { Env } from '../../_lib/env'

export type ProviderName = 'google' | 'microsoft' | 'microsoft-other'

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
  // Two Microsoft providers backed by two separate Azure app registrations:
  //   microsoft       -> the PSU-owned single-tenant app, pinned to the PSU
  //                      tenant endpoint (the /common endpoint rejects a
  //                      single-tenant app with AADSTS50194).
  //   microsoft-other -> a separate multi-tenant + personal-accounts app on
  //                      /common, for any non-PSU Microsoft account.
  // Both use Microsoft's OIDC userinfo endpoint, which returns the same
  // sub/email/name claim shape as Google's — normalizeProfile needs no
  // provider-specific case.
  if (name === 'microsoft') {
    if (!env.MICROSOFT_TENANT_ID) throw new Error('MICROSOFT_TENANT_ID not set')
    const base = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0`
    return {
      authUrl: `${base}/authorize`,
      tokenUrl: `${base}/token`,
      userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
      scope: 'openid email profile',
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    }
  }
  if (name === 'microsoft-other') {
    return {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
      scope: 'openid email profile',
      clientId: env.MICROSOFT_OTHER_CLIENT_ID,
      clientSecret: env.MICROSOFT_OTHER_CLIENT_SECRET,
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
