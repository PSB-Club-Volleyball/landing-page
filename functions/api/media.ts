import type { Env } from './_lib/env'
import { json } from './_lib/http'

// GET /api/media               -> all media, newest first
// GET /api/media?event_id=12   -> media for one event/album
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const eventId = url.searchParams.get('event_id')

  const items = eventId
    ? await env.DB.prepare(
        `SELECT id, r2_key, media_type, caption, event_id, width, height,
                duration_seconds, sort_order, created_at
         FROM media WHERE event_id = ?1
         ORDER BY sort_order, created_at DESC`
      )
        .bind(Number(eventId))
        .all()
    : await env.DB.prepare(
        `SELECT id, r2_key, media_type, caption, event_id, width, height,
                duration_seconds, sort_order, created_at
         FROM media
         ORDER BY sort_order, created_at DESC`
      ).all()

  return json({ media: items.results ?? [] })
}
