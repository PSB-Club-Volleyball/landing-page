import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { requireOwner } from '../_lib/permissions'

// POST /api/admin/owner/transfer  Body: { to_user_id: number }
// Hands ownership to another user, e.g. at end of year. Both role flips run
// in one batch so the DB never has zero or two owners mid-flight.
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const body = await request.json<{ to_user_id?: number }>().catch(() => null)
  const toUserId = body?.to_user_id
  if (!toUserId || !Number.isInteger(toUserId)) return badRequest('to_user_id is required')
  if (toUserId === data.user.id) return badRequest('Already the owner')

  const target = await env.DB.prepare(`SELECT id FROM users WHERE id = ?1`)
    .bind(toUserId)
    .first<{ id: number }>()
  if (!target) return notFound('User not found')

  // The target can vanish between the SELECT above and this batch, so the
  // demote is guarded on it still existing — otherwise the club would be left
  // with no owner. Demote runs first because idx_users_single_owner rejects
  // two owners at once. The batch is one transaction, so a vanished target
  // means neither statement changed anything.
  const [demoted, promoted] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET role = 'admin' WHERE id = ?1 AND EXISTS (SELECT 1 FROM users WHERE id = ?2)`
    ).bind(data.user.id, toUserId),
    env.DB.prepare(`UPDATE users SET role = 'owner' WHERE id = ?1`).bind(toUserId),
  ])
  if (demoted.meta.changes === 0 && promoted.meta.changes === 0) return notFound('User not found')
  if (demoted.meta.changes !== 1 || promoted.meta.changes !== 1) {
    throw new Error(
      `Owner transfer ${data.user.id} -> ${toUserId} changed ${demoted.meta.changes}/${promoted.meta.changes} rows`
    )
  }

  await logAudit(env, data.user.id, 'update', 'users', toUserId, { role: 'owner', transferredFrom: data.user.id })
  return json({ ok: true })
}
