import type { Env } from '../_lib/env'
import { json } from '../_lib/http'

const COLUMNS = `id, email, name, avatar_url, provider, role, position, team, skill_level,
                 skill_level_locked, waiver_signed_year, waiver_signed_at, dues_paid_year, dues_paid_at,
                 rsvp_restricted, created_at`

// GET /api/admin/users -> everyone who has ever signed in, newest first
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const users = await env.DB.prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC`).all<
    Record<string, unknown> & { rsvp_restricted: number; skill_level_locked: number }
  >()

  const withBooleans = (users.results ?? []).map((u) => ({
    ...u,
    rsvp_restricted: Boolean(u.rsvp_restricted),
    skill_level_locked: Boolean(u.skill_level_locked),
  }))
  return json({ users: withBooleans })
}
