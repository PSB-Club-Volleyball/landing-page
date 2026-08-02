import type { Env } from './_lib/env'
import { json } from './_lib/http'

// GET /api/events -> published + cancelled events (drafts stay admin-only), soonest first
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const events = await env.DB.prepare(
    `SELECT id, title, description, event_type, start_time, end_time,
            location_name, location_address, status
     FROM events
     WHERE status IN ('published', 'cancelled')
     ORDER BY start_time ASC`
  ).all()

  return json({ events: events.results ?? [] })
}
