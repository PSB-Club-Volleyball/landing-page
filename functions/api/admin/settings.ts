import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { requireOwner } from './_lib/permissions'
import { getLoginSettings } from '../auth/_lib/settings'
import { ensureRosterEntry } from './_lib/roster'

// GET /api/admin/settings -> current login-provider toggles (owner only)
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const settings = await getLoginSettings(env)
  return json(settings)
}

interface SettingsInput {
  google_enabled: boolean
  microsoft_enabled: boolean
  current_season?: string | null
  roster_visible?: boolean
}

// PUT /api/admin/settings -> toggle which OAuth providers accept new sign-ins,
// set the current season used to auto-add approved club members/admins to
// the roster (see admin/_lib/roster.ts), and show/hide the public roster
// page's player list. At least one sign-in provider must stay enabled, or
// nobody could ever sign in again.
export const onRequestPut: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const body = await request.json<Partial<SettingsInput>>().catch(() => null)
  if (!body || typeof body.google_enabled !== 'boolean' || typeof body.microsoft_enabled !== 'boolean') {
    return badRequest('google_enabled and microsoft_enabled are required booleans')
  }
  if (!body.google_enabled && !body.microsoft_enabled) {
    return badRequest('At least one sign-in provider must stay enabled')
  }

  const season = body.current_season?.trim() || null
  const rosterVisible = body.roster_visible ?? true

  await env.DB.prepare(
    `UPDATE login_settings SET google_enabled = ?1, microsoft_enabled = ?2, current_season = ?3, roster_visible = ?4 WHERE id = 1`
  )
    .bind(body.google_enabled ? 1 : 0, body.microsoft_enabled ? 1 : 0, season, rosterVisible ? 1 : 0)
    .run()

  await logAudit(env, data.user.id, 'update', 'login_settings', null, body)

  // Setting (or changing) the current season backfills every already-
  // approved club member/admin into that season's roster — ensureRosterEntry
  // is a no-op for anyone who already has a row there, so this is safe to
  // run again on every save.
  if (season) {
    const members = await env.DB.prepare(
      `SELECT id FROM users WHERE status = 'approved' AND role IN ('club_member', 'admin')`
    ).all<{ id: number }>()
    for (const member of members.results ?? []) {
      await ensureRosterEntry(env, member.id)
    }
  }

  return json({ ok: true })
}
