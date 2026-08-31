import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { requireOwner } from '../_lib/permissions'

// POST /api/admin/owner/transfer  Body: { to_user_id: number }
// Hands ownership to another approved user, e.g. at end of year. Both role
// flips run in one batch so the DB never has zero or two owners mid-flight.
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const body = await request.json<{ to_user_id?: number }>().catch(() => null)
  const toUserId = body?.to_user_id
  if (!toUserId || !Number.isInteger(toUserId)) return badRequest('to_user_id is required')
  if (toUserId === data.user.id) return badRequest('Already the owner')

  const target = await env.DB.prepare(`SELECT id, status FROM users WHERE id = ?1`)
    .bind(toUserId)
    .first<{ id: number; status: string }>()
  if (!target) return notFound('User not found')
  if (target.status !== 'approved') return badRequest('Ownership can only transfer to an approved user')

  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(data.user.id),
    env.DB.prepare(`UPDATE users SET role = 'owner' WHERE id = ?1`).bind(toUserId),
  ])

  await logAudit(env, data.user.id, 'update', 'users', toUserId, { role: 'owner', transferredFrom: data.user.id })
  return json({ ok: true })
}
