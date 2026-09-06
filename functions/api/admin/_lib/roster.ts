import type { Env } from '../../_lib/env'
import { getCurrentSeason } from '../../auth/_lib/settings'

function splitName(name: string): { first_name: string; last_name: string } {
  const [first, ...rest] = name.trim().split(/\s+/)
  return { first_name: first ?? '', last_name: rest.join(' ') }
}

// Auto-adds an approved club member/admin to the current season's roster,
// mirroring what an admin would otherwise do by hand every season. A no-op
// when no current season is set (Settings tab), the account has no name to
// split into first/last, or this account already has a roster row for that
// season (tracked via roster.user_id) — so re-saving the same role, or
// re-running this after a season is set, never creates a duplicate.
export async function ensureRosterEntry(env: Env, userId: number): Promise<void> {
  const season = await getCurrentSeason(env)
  if (!season) return

  const user = await env.DB.prepare(`SELECT name, position FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ name: string | null; position: string | null }>()
  if (!user?.name?.trim()) return

  const { first_name, last_name } = splitName(user.name)
  if (!first_name || !last_name) return

  const existing = await env.DB.prepare(`SELECT 1 FROM roster WHERE user_id = ?1 AND season = ?2`)
    .bind(userId, season)
    .first()
  if (existing) return

  await env.DB.prepare(
    `INSERT INTO roster (season, first_name, last_name, position, user_id) VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(season, first_name, last_name, user.position ?? null, userId)
    .run()
}
