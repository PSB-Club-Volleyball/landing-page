import type { Env } from './_lib/env'
import { json } from './_lib/http'
import { getSessionUser } from './_lib/session'

// GET /api/events -> published + cancelled events (drafts stay admin-only), soonest
// first. If the visitor is signed in, each event also carries their own signup
// (if any) so the card can offer "cancel" instead of "RSVP" without a second request.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const events = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.event_type, e.start_time, e.end_time,
            e.location_name, e.location_address, e.status, e.recurrence_days, e.recurrence_until,
            e.signup_enabled, e.form_id, e.capacity,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signup_count
     FROM events e
     WHERE e.status IN ('published', 'cancelled')
     ORDER BY e.start_time ASC`
  ).all<Record<string, unknown> & { signup_enabled: number; id: number }>()

  const sessionUser = await getSessionUser(request, env)
  const mySignupsByEvent = new Map<number, { id: number }>()
  if (sessionUser) {
    const mine = await env.DB.prepare(`SELECT id, event_id FROM event_signups WHERE LOWER(email) = ?1`)
      .bind(sessionUser.email.toLowerCase())
      .all<{ id: number; event_id: number }>()
    for (const row of mine.results ?? []) mySignupsByEvent.set(row.event_id, { id: row.id })
  }

  const withExtras = (events.results ?? []).map((e) => ({
    ...e,
    signup_enabled: Boolean(e.signup_enabled),
    my_signup_id: mySignupsByEvent.get(e.id)?.id ?? null,
  }))
  return json({ events: withExtras })
}
