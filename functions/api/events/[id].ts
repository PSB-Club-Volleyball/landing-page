import type { Env } from '../_lib/env'
import { badRequest, json, notFound } from '../_lib/http'
import { getSessionUser } from '../_lib/session'
import { computeStandings } from '../_lib/standings'
import { addMinutes, readScheduleConfig } from '../_lib/schedule'

// GET /api/events/:id -> a single published or cancelled event, for its own
// public page at /events/:eventId. Drafts stay admin-only (404 here). Unlike
// the list at /api/events, this doesn't hide past events or unreleased series
// occurrences — someone with the direct link can always open the page; the
// list is the only place that "releases" weekly occurrences a week at a time.
// If the visitor is signed in, the event carries their own signup (if any) so
// the page can offer "manage" instead of "sign up" without a second request.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const event = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.event_type, e.start_time, e.end_time,
            e.location_name, e.location_address, e.status,
            e.signup_enabled, e.rsvp_gated, e.form_id, e.capacity, e.tags, e.signup_deadline,
            e.play_format, e.format_config,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id AND s.status = 'approved') AS signup_count
     FROM events e
     WHERE e.id = ?1 AND e.status IN ('published', 'cancelled')`
  )
    .bind(id)
    .first<
      | (Record<string, unknown> & {
          signup_enabled: number
          rsvp_gated: number
          id: number
          start_time: string
          play_format: string | null
          format_config: string | null
        })
      | null
    >()

  if (!event) return notFound('Event not found')

  const sessionUser = await getSessionUser(request, env)
  let mySignup: { id: number; status: string } | null = null
  if (sessionUser) {
    mySignup = await env.DB.prepare(
      `SELECT id, status FROM event_signups WHERE event_id = ?1 AND LOWER(email) = ?2`
    )
      .bind(id, sessionUser.email.toLowerCase())
      .first<{ id: number; status: string }>()
  }

  // Published teams only. Members are name + captain flag — no contact info
  // leaves the admin side.
  const teamRows = await env.DB.prepare(
    `SELECT id, name, seed, pool FROM event_teams WHERE event_id = ?1 AND published = 1 ORDER BY seed, id`
  )
    .bind(id)
    .all<{ id: number; name: string; seed: number; pool: string | null }>()

  const teamList = teamRows.results ?? []
  let teams: {
    id: number
    name: string
    seed: number
    pool: string | null
    members: { name: string; is_captain: boolean }[]
  }[] = []
  if (teamList.length > 0) {
    const ids = teamList.map((t) => t.id)
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
    const memberRes = await env.DB.prepare(
      `SELECT m.team_id, m.is_captain, COALESCE(m.display_name, s.name) AS name
       FROM event_team_members m
       LEFT JOIN event_signups s ON s.id = m.signup_id
       WHERE m.team_id IN (${placeholders})
       ORDER BY m.id`
    )
      .bind(...ids)
      .all<{ team_id: number; is_captain: number; name: string | null }>()
    const memberList = memberRes.results ?? []
    teams = teamList.map((t) => ({
      id: t.id,
      name: t.name,
      seed: t.seed,
      pool: t.pool,
      members: memberList
        .filter((m) => m.team_id === t.id)
        .map((m) => ({ name: m.name ?? 'Unknown', is_captain: Boolean(m.is_captain) })),
    }))
  }

  // Schedule + standings ride along whenever teams are published.
  const scheduleConfig = readScheduleConfig(event.format_config)

  let matches: unknown[] = []
  let standings: unknown[] = []
  if (teamList.length > 0) {
    const matchRes = await env.DB.prepare(
      `SELECT m.id, m.bracket, m.round, m.slot, m.court, m.team_a_id, m.team_b_id,
              ta.name AS team_a_name, tb.name AS team_b_name,
              m.scores, m.forfeit_team_id, m.winner_id
       FROM event_matches m
       LEFT JOIN event_teams ta ON ta.id = m.team_a_id
       LEFT JOIN event_teams tb ON tb.id = m.team_b_id
       WHERE m.event_id = ?1
       ORDER BY m.round, m.slot, m.court`
    )
      .bind(id)
      .all<{
        id: number
        bracket: string
        round: number
        slot: number
        court: string | null
        team_a_id: number | null
        team_b_id: number | null
        team_a_name: string | null
        team_b_name: string | null
        scores: string | null
        forfeit_team_id: number | null
        winner_id: number | null
      }>()
    const parsedMatches = (matchRes.results ?? []).map((r) => ({
      ...r,
      scores: r.scores ? (JSON.parse(r.scores) as [number, number][]) : null,
    }))
    matches = parsedMatches.map((r) => ({
      ...r,
      start_time: addMinutes(event.start_time, r.slot * scheduleConfig.slot_minutes),
    }))
    if (!scheduleConfig.timed_only) {
      const rows = computeStandings(
        teamList.map((t) => ({ id: t.id, name: t.name })),
        parsedMatches,
        scheduleConfig.sets_per_match
      )
      // Hide the table until at least one match has actually been played.
      if (rows.some((r) => r.played > 0)) standings = rows
    }
  }

  return json({
    event: {
      ...event,
      format_config: undefined,
      signup_enabled: Boolean(event.signup_enabled),
      rsvp_gated: Boolean(event.rsvp_gated),
      my_signup_id: mySignup?.id ?? null,
      my_signup_status: mySignup?.status ?? null,
      teams,
      schedule_config: scheduleConfig,
      matches,
      standings,
    },
  })
}
