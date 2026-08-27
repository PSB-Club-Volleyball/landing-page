import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { requireOwner } from '../_lib/permissions'

// PUT /api/admin/users/:id  Body: { status: 'approved' | 'denied' }
// This is the actual gate: nobody touches roster/board/events/media data
// until an already-approved user flips their status here. Owner-only — and
// the owner's own row is excluded from the WHERE clause below, so ownership
// can never be revoked through this endpoint, even by the owner themselves;
// see functions/api/admin/owner/transfer.ts for the only way to move it.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<{ status?: string }>().catch(() => null)
  if (!body || (body.status !== 'approved' && body.status !== 'denied')) {
    return badRequest('status must be "approved" or "denied"')
  }

  const result = await env.DB.prepare(
    `UPDATE users SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2
     WHERE id = ?3 AND role != 'owner'`
  )
    .bind(body.status, data.user.id, id)
    .run()

  if (result.meta.changes === 0) {
    const exists = await env.DB.prepare(`SELECT 1 FROM users WHERE id = ?1`).bind(id).first()
    if (!exists) return notFound('User not found')
    return badRequest("The owner's access can't be changed here — transfer ownership first")
  }

  await logAudit(env, data.user.id, 'update', 'users', id, { status: body.status })
  return json({ ok: true })
}
