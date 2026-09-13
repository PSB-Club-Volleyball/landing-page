import type { Env } from './_lib/env'
import { badRequest, forbidden, json, unauthorized } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { eventCutoff } from './_lib/time'
import { getPlayerResults } from './_lib/playerResults'

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]

// GET /api/profile -> the signed-in user's own account page. `status`
// (skill level, waiver, RSVP restriction) applies to every signed-in
// account regardless of role; `club` (position/team/dues/roster — genuinely
// meaningless for an outsider) is only populated for approved club
// members. Also includes their RSVPs and personal match record.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const statusRow = await env.DB.prepare(
    `SELECT skill_level, skill_level_locked, waiver_signed_year, rsvp_restricted FROM users WHERE id = ?1`
  )
    .bind(sessionUser.id)
    .first<{
      skill_level: string | null
      skill_level_locked: number
      waiver_signed_year: number | null
      rsvp_restricted: number
    }>()

  const status = {
    skillLevel: statusRow?.skill_level ?? null,
    skillLevelLocked: Boolean(statusRow?.skill_level_locked),
    waiverSignedYear: statusRow?.waiver_signed_year ?? null,
    rsvpRestricted: Boolean(statusRow?.rsvp_restricted),
  }

  let club: unknown = null
  if (sessionUser.role !== 'outsider') {
    const row = await env.DB.prepare(`SELECT position, team, dues_paid_year, dues_paid_at FROM users WHERE id = ?1`)
      .bind(sessionUser.id)
      .first<{
        position: string | null
        team: string | null
        dues_paid_year: number | null
        dues_paid_at: string | null
      }>()

    const rosterRow = await env.DB.prepare(
      `SELECT season, jersey_number, class_year FROM roster WHERE user_id = ?1 ORDER BY season DESC LIMIT 1`
    )
      .bind(sessionUser.id)
      .first<{ season: string; jersey_number: number | null; class_year: string | null }>()

    club = {
      position: row?.position ?? null,
      team: row?.team ?? null,
      duesPaidYear: row?.dues_paid_year ?? null,
      duesPaidAt: row?.dues_paid_at ?? null,
      roster: rosterRow
        ? { season: rosterRow.season, jerseyNumber: rosterRow.jersey_number, classYear: rosterRow.class_year }
        : null,
    }
  }

  const rsvpRows = await env.DB.prepare(
    `SELECT s.id AS signup_id, s.status, e.id AS event_id, e.title, e.start_time, e.location_name
     FROM event_signups s JOIN events e ON e.id = s.event_id
     WHERE LOWER(s.email) = ?1 AND s.status IN ('approved', 'pending')
       AND COALESCE(e.end_time, e.start_time) >= ?2
     ORDER BY e.start_time ASC`
  )
    .bind(sessionUser.email.toLowerCase(), eventCutoff(2))
    .all<{
      signup_id: number
      status: string
      event_id: number
      title: string
      start_time: string
      location_name: string | null
    }>()

  const upcomingRsvps = (rsvpRows.results ?? []).map((r) => ({
    signupId: r.signup_id,
    eventId: r.event_id,
    title: r.title,
    startTime: r.start_time,
    locationName: r.location_name,
    status: r.status,
  }))

  const results = await getPlayerResults(env, sessionUser.email)

  return json({
    profile: {
      account: {
        name: sessionUser.name,
        email: sessionUser.email,
        avatarUrl: sessionUser.avatarUrl,
        provider: sessionUser.provider,
        role: sessionUser.role,
      },
      status,
      club,
      upcomingRsvps,
      results,
    },
  })
}

// PATCH /api/profile  Body: { skill_level: SkillLevel | null }
// Self-service skill level. 403s if an admin has locked this account's
// skill level (see functions/api/admin/users/[id].ts) — the admin's value
// then only changes from the admin Users panel.
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const body = await request.json<{ skill_level?: SkillLevel | null }>().catch(() => null)
  if (!body || body.skill_level === undefined) return badRequest('skill_level is required')
  if (body.skill_level !== null && !SKILL_LEVELS.includes(body.skill_level)) {
    return badRequest(`skill_level must be one of ${SKILL_LEVELS.join(', ')}, or null`)
  }

  const row = await env.DB.prepare(`SELECT skill_level_locked FROM users WHERE id = ?1`)
    .bind(sessionUser.id)
    .first<{ skill_level_locked: number }>()
  if (row?.skill_level_locked) {
    return forbidden('An admin has locked your skill level')
  }

  await env.DB.prepare(`UPDATE users SET skill_level = ?1 WHERE id = ?2`).bind(body.skill_level, sessionUser.id).run()

  return json({ ok: true })
}
