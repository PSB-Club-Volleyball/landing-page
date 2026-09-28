import type { Env } from './_lib/env'
import { badRequest, json } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { visibilitiesFor } from './_lib/visibility'

// GET /api/media               -> all media, newest first
// GET /api/media?event_id=12   -> media for one event/album
// Media tied to an event only shows if the viewer could see that event
// (published/cancelled, and a visibility their role allows) — event ids are
// guessable, so this is enforced here rather than by the Photos page.
// Unattached media is public.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const eventParam = url.searchParams.get('event_id')
  const eventId = eventParam === null ? null : Number(eventParam)
  if (eventId !== null && !Number.isInteger(eventId)) return badRequest('Invalid event_id')

  const role = (await getSessionUser(request, env))?.role ?? 'outsider'
  // Fixed literals from visibilitiesFor, safe to inline.
  const visible = visibilitiesFor(role).map((v) => `'${v}'`).join(', ')
  const items = await env.DB.prepare(
    `SELECT m.id, m.r2_key, m.media_type, m.caption, m.event_id, m.width, m.height,
            m.duration_seconds, m.sort_order, m.created_at
     FROM media m
     LEFT JOIN events e ON e.id = m.event_id
     WHERE (?1 IS NULL OR m.event_id = ?1)
       AND (m.event_id IS NULL OR (e.status IN ('published', 'cancelled') AND e.visibility IN (${visible})))
     ORDER BY m.sort_order, m.created_at DESC`
  )
    .bind(eventId)
    .all()

  return json({ media: items.results ?? [] })
}
