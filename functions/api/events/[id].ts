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

  return json({
    event: {
      ...event,
      signup_enabled: Boolean(event.signup_enabled),
      rsvp_gated: Boolean(event.rsvp_gated),
      my_signup_id: mySignup?.id ?? null,
      my_signup_status: mySignup?.status ?? null,
    },
  })
}
