import type { Env } from './env'
import { parseCookies, SESSION_COOKIE } from './cookies'
import { sha256Hex } from './crypto'
import type { UserRole } from './roles'

export interface SessionUser {
  id: number
  email: string
  name: string | null
  avatarUrl: string | null
  provider: string
  status: 'pending' | 'approved' | 'denied'
  role: UserRole
}

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.get('cookie'))
  const token = cookies[SESSION_COOKIE]
  if (!token) return null

  const tokenHash = await sha256Hex(token)
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.provider, u.status, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{
      id: number
      email: string
      name: string | null
      avatar_url: string | null
      provider: string
      status: string
      role: string
    }>()

  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    provider: row.provider,
    status: row.status as SessionUser['status'],
    role: row.role as SessionUser['role'],
  }
}
