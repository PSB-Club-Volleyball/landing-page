import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

const FIELDS = ['season', 'role', 'first_name', 'last_name', 'email', 'sort_order'] as const

// PUT /api/admin/board/:id -> partial update, any subset of FIELDS
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
    `UPDATE board SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?${updates.length + 1}`
  )
    .bind(...values, id)
    .run()

  if (result.meta.changes === 0) return notFound('Board member not found')

  await logAudit(env, data.user.id, 'update', 'board', id, body)
  return json({ ok: true })
}

// DELETE /api/admin/board/:id
export const onRequestDelete: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const result = await env.DB.prepare(`DELETE FROM board WHERE id = ?1`).bind(id).run()
  if (result.meta.changes === 0) return notFound('Board member not found')

  await logAudit(env, data.user.id, 'delete', 'board', id)
  return json({ ok: true })
}
