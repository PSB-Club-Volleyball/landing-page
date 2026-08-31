import type { Env } from './_lib/env'
import { json } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { isAtLeast } from './_lib/roles'

// GET /api/events -> published + cancelled events (drafts stay admin-only), soonest
// first. Two things are filtered out here rather than in the admin table, since
// both are purely about what's worth showing a visitor right now, not the
// event's underlying status:
//  - events that have already happened ("removed automatically" once over)
//  - series occurrences (weekly practices etc.) more than a week out, so a
//    whole season of practices created at once "releases" one week at a time
//    instead of all showing up front. One-time events aren't held back this way.
// A third filter, visibility, depends on the visitor's role rather than the
// event itself, so it's computed from the session before the query runs.
// If the visitor is signed in, each event also carries their own signup (if
// any) so the card can offer "cancel" instead of "RSVP" without a second request.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  const role = sessionUser?.role ?? 'outsider'
  const allowedVisibilities = isAtLeast(role, 'admin')
    ? ['public', 'club', 'eboard']
    : isAtLeast(role, 'club_member')
      ? ['public', 'club']
      : ['public']
  const visibilityPlaceholders = allowedVisibilities.map((_, i) => `?${i + 1}`).join(', ')

  const events = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.event_type, e.start_time, e.end_time,
            e.location_name, e.location_address, e.status, e.visibility,
            e.signup_enabled, e.rsvp_gated, e.form_id, e.capacity,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id AND s.status = 'approved') AS signup_count
     FROM events e
     WHERE e.status IN ('published', 'cancelled')
       AND e.visibility IN (${visibilityPlaceholders})
       AND datetime(COALESCE(e.end_time, e.start_time)) >= datetime('now')
       AND (e.series_id IS NULL OR date(e.start_time) <= date('now', '+7 days'))
     ORDER BY e.start_time ASC`
  )
    .bind(...allowedVisibilities)
    .all<Record<string, unknown> & { signup_enabled: number; rsvp_gated: number; id: number }>()

  const mySignupsByEvent = new Map<number, { id: number; status: string }>()
  if (sessionUser) {
    const mine = await env.DB.prepare(`SELECT id, event_id, status FROM event_signups WHERE LOWER(email) = ?1`)
      .bind(sessionUser.email.toLowerCase())
      .all<{ id: number; event_id: number; status: string }>()
    for (const row of mine.results ?? []) mySignupsByEvent.set(row.event_id, { id: row.id, status: row.status })
  }

  const withExtras = (events.results ?? []).map((e) => ({
    ...e,
    signup_enabled: Boolean(e.signup_enabled),
    rsvp_gated: Boolean(e.rsvp_gated),
    my_signup_id: mySignupsByEvent.get(e.id)?.id ?? null,
    my_signup_status: mySignupsByEvent.get(e.id)?.status ?? null,
  }))
  return json({ events: withExtras })
}
