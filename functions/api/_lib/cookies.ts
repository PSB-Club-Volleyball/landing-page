export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export interface CookieOptions {
  maxAge?: number
  path?: string
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${opts.path ?? '/'}`)
  parts.push(`Max-Age=${opts.maxAge ?? 0}`)
  parts.push('HttpOnly')
  parts.push('Secure')
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`)
  return parts.join('; ')
}

export const SESSION_COOKIE = 'session'
export const OAUTH_STATE_COOKIE = 'oauth_state'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
