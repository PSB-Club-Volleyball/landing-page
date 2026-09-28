import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

// A deliberately loose shape check: something@something.tld, no spaces.
// Whether the address is real is proven by its owner signing in with it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The lowercased address, or null if it isn't a string shaped like one.
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return EMAIL_SHAPE.test(email) ? email : null
}

// 409 naming the account that already holds `email`, so the admin can go
// merge instead of guessing.
export async function emailTaken(env: Env, email: string): Promise<Response | null> {
  const holder = await env.DB.prepare(
    `SELECT u.id, u.name, u.email FROM user_emails ue JOIN users u ON u.id = ue.user_id WHERE ue.email = ?1`
  )
    .bind(email)
    .first<{ id: number; name: string | null; email: string }>()
  if (!holder) return null
  return json(
    { error: `${email} already belongs to ${holder.name || holder.email}`, user_id: holder.id },
    { status: 409 }
  )
}
