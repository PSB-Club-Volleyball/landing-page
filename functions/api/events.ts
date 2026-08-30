import type { Env } from './_lib/env'
import { json } from './_lib/http'

// GET /api/events -> published + cancelled events (drafts stay admin-only), soonest first
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const events = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.event_type, e.start_time, e.end_time,
            e.location_name, e.location_address, e.status, e.recurrence_days, e.recurrence_until,
            e.signup_enabled, e.form_id, e.capacity,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signup_count
     FROM events e
     WHERE e.status IN ('published', 'cancelled')
     ORDER BY e.start_time ASC`
  ).all<Record<string, unknown> & { signup_enabled: number }>()

  const withBooleans = (events.results ?? []).map((e) => ({ ...e, signup_enabled: Boolean(e.signup_enabled) }))
  return json({ events: withBooleans })
}
