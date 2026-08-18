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
  const contentType = request.headers.get('content-type') || 'application/octet-stream'

  if (!filename) return badRequest('filename query param is required')

  const mediaType =
    url.searchParams.get('media_type') || (contentType.startsWith('video/') ? 'video' : 'photo')

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-')
  const r2Key = `${mediaType}/${crypto.randomUUID()}-${safeName}`

  const body = await request.arrayBuffer()
  await env.MEDIA_BUCKET.put(r2Key, body, { httpMetadata: { contentType } })

  const eventId = eventIdParam ? Number(eventIdParam) : null
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
