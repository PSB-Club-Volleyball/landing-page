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
  //                      /common. The callback accepts only personal (MSA)
  //                      accounts from it; see isPersonalMicrosoftAccount.
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
    // Symmetric with the tenant-id check above: fail loudly rather than build
    // an authorize URL with client_id=undefined if the toggle is on before the
    // separate app registration's secrets are set.
    if (!env.MICROSOFT_OTHER_CLIENT_ID || !env.MICROSOFT_OTHER_CLIENT_SECRET) {
      throw new Error('MICROSOFT_OTHER_CLIENT_ID / MICROSOFT_OTHER_CLIENT_SECRET not set')
    }
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
  // Google's userinfo carries email_verified; Microsoft's doesn't, so null
  // there means "not reported", not "unverified".
  emailVerified: boolean | null
}

// The fixed tenant ID Microsoft stamps on every personal (MSA: outlook.com,
// hotmail, live) account's tokens. Any other tid is a work/school tenant,
// whose admins can set a user's email to anything.
export const MSA_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad'

// Reads the payload of an ID token without checking its signature. That is
// only safe because every caller got the token straight from the provider's
// token endpoint over TLS in the same request — never from the browser.
export function decodeIdTokenPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed id_token')
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  return JSON.parse(json) as Record<string, unknown>
}

export function isPersonalMicrosoftAccount(idToken: string): boolean {
  return decodeIdTokenPayload(idToken).tid === MSA_CONSUMER_TENANT_ID
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
    emailVerified: typeof raw.email_verified === 'boolean' ? raw.email_verified : null,
  }
}
