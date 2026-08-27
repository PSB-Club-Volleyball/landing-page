import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { requireOwner } from '../_lib/permissions'

const FIELDS = ['caption', 'event_id', 'sort_order'] as const

// PUT /api/admin/media/:id -> update caption/album/order (not the file itself — delete + re-upload for that)
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<Record<string, unknown>>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  const updates = FIELDS.filter((field) => field in body)
  if (updates.length === 0) return badRequest('No recognized fields to update')

  const setClause = updates.map((field, i) => `${field} = ?${i + 1}`).join(', ')
  const values = updates.map((field) => body[field])

  const result = await env.DB.prepare(
    `UPDATE media SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?${updates.length + 1}`
  )
    .bind(...values, id)
    .run()

  if (result.meta.changes === 0) return notFound('Media not found')

  await logAudit(env, data.user.id, 'update', 'media', id, body)
  return json({ ok: true })
}

// DELETE /api/admin/media/:id -> owner only, removes the D1 row and the R2 object
export const onRequestDelete: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const row = await env.DB.prepare(`SELECT r2_key FROM media WHERE id = ?1`).bind(id).first<{ r2_key: string }>()
  if (!row) return notFound('Media not found')

  await env.DB.prepare(`DELETE FROM media WHERE id = ?1`).bind(id).run()
  await env.MEDIA_BUCKET.delete(row.r2_key)

  await logAudit(env, data.user.id, 'delete', 'media', id, { r2Key: row.r2_key })
  return json({ ok: true })
}
