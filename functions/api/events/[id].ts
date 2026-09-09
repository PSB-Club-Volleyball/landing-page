import type { Env } from '../_lib/env'
import { badRequest, json, notFound } from '../_lib/http'
import { getSessionUser } from '../_lib/session'

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
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id AND s.status = 'approved') AS signup_count
     FROM events e
     WHERE e.id = ?1 AND e.status IN ('published', 'cancelled')`
  )
    .bind(id)
    .first<(Record<string, unknown> & { signup_enabled: number; rsvp_gated: number; id: number }) | null>()

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

  return json({
    event: {
      ...event,
      signup_enabled: Boolean(event.signup_enabled),
      rsvp_gated: Boolean(event.rsvp_gated),
      my_signup_id: mySignup?.id ?? null,
      my_signup_status: mySignup?.status ?? null,
      teams,
    },
  })
}
