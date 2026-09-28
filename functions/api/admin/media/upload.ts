import type { Env } from '../../_lib/env'
import { badRequest, json } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

// POST /api/admin/media/upload?filename=x.jpg&media_type=photo&event_id=&caption=
// Body: raw file bytes. Resize photos client-side before uploading — see the
// R2 storage budget in the schema doc (~300KB/photo keeps the free tier huge).
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const url = new URL(request.url)
  const filename = url.searchParams.get('filename')
  const eventIdParam = url.searchParams.get('event_id')
  const caption = url.searchParams.get('caption')
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()

  if (!filename) return badRequest('filename query param is required')
  // Files are served back from our own origin (/api/media/file/...), so only
  // image and video types get stored — an uploaded text/html would otherwise
  // run as script on the site. SVG is an image type that can carry script too.
  if (!contentType || !/^(image|video)\/[a-z0-9.+-]+$/.test(contentType) || contentType === 'image/svg+xml') {
    return badRequest('Only image or video uploads are allowed')
  }

  const mediaType = url.searchParams.get('media_type') || (contentType.startsWith('video/') ? 'video' : 'photo')
  if (mediaType !== 'photo' && mediaType !== 'video') return badRequest('media_type must be photo or video')
  if ((mediaType === 'video') !== contentType.startsWith('video/')) {
    return badRequest('media_type does not match the file type')
  }

  // Checked before the R2 put so a bad event_id never leaves an orphaned object.
  let eventId: number | null = null
  if (eventIdParam) {
    eventId = Number(eventIdParam)
    if (!Number.isInteger(eventId)) return badRequest('event_id must be an integer')
    const event = await env.DB.prepare(`SELECT id FROM events WHERE id = ?1`).bind(eventId).first()
    if (!event) return badRequest('event_id does not match an event')
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-')
  const r2Key = `${mediaType}/${crypto.randomUUID()}-${safeName}`

  const body = await request.arrayBuffer()
  await env.MEDIA_BUCKET.put(r2Key, body, { httpMetadata: { contentType } })

  const result = await env.DB.prepare(
    `INSERT INTO media (r2_key, media_type, caption, event_id, uploaded_by)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(r2Key, mediaType, caption ?? null, eventId, data.user.id)
    .run()

  const id = Number(result.meta.last_row_id)
  await logAudit(env, data.user.id, 'create', 'media', id, { r2Key, mediaType })
  return json({ id, r2_key: r2Key }, { status: 201 })
}
