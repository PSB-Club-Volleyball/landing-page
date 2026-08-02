import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

// PUT /api/admin/users/:id  Body: { status: 'approved' | 'denied' }
// This is the actual gate: nobody touches roster/board/events/media data
// until an already-approved user flips their status here.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<{ status?: string }>().catch(() => null)
  if (!body || (body.status !== 'approved' && body.status !== 'denied')) {
    return badRequest('status must be "approved" or "denied"')
  }

  const result = await env.DB.prepare(
    `UPDATE users SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2 WHERE id = ?3`
  )
    .bind(body.status, data.user.id, id)
    .run()

  if (result.meta.changes === 0) return notFound('User not found')

  await logAudit(env, data.user.id, 'update', 'users', id, { status: body.status })
  return json({ ok: true })
}
