import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

const SETTABLE_ROLES = ['outsider', 'club_member', 'admin'] as const
type SettableRole = (typeof SETTABLE_ROLES)[number]

interface UsersPatchInput {
  status?: 'approved' | 'denied'
  role?: SettableRole
  position?: string | null
  team?: 'A' | 'B' | null
}

// PUT /api/admin/users/:id  Body: any subset of { status, role, position, team }
// Any admin can approve/deny and promote/demote between outsider and
// club_member. Granting 'admin', or touching a row that's currently admin,
// is owner-only — an admin can't create or remove other admins. Nobody can
// set role to 'owner' here or touch the owner's own row; see
// functions/api/admin/owner/transfer.ts for the only way to move ownership.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<UsersPatchInput>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  // Fetched once regardless of which fields are being changed — an admin
  // can't touch ANY field on a row that's currently admin, not just role,
  // otherwise position/team/status edits would bypass the owner-only rule.
  const target = await env.DB.prepare(`SELECT role FROM users WHERE id = ?1`).bind(id).first<{ role: string }>()
  if (!target) return notFound('User not found')
  if (target.role === 'admin' && data.user.role !== 'owner') {
    return badRequest("Only the owner can change an admin's account")
  }

  const setClauses: string[] = []
  const values: unknown[] = []
  const auditDetails: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (body.status !== 'approved' && body.status !== 'denied') {
      return badRequest('status must be "approved" or "denied"')
    }
    values.push(body.status)
    setClauses.push(`status = ?${values.length}`)
    values.push(data.user.id)
    setClauses.push(`decided_by = ?${values.length}`)
    setClauses.push(`decided_at = CURRENT_TIMESTAMP`)
    auditDetails.status = body.status
  }

  if (body.role !== undefined) {
    if (!SETTABLE_ROLES.includes(body.role)) {
      return badRequest(`role must be one of ${SETTABLE_ROLES.join(', ')}`)
    }
    if (body.role === 'admin' && data.user.role !== 'owner') {
      return badRequest('Only the owner can grant admin')
    }
    values.push(body.role)
    setClauses.push(`role = ?${values.length}`)
    auditDetails.role = body.role
  }

  if (body.position !== undefined) {
    values.push(body.position || null)
    setClauses.push(`position = ?${values.length}`)
    auditDetails.position = body.position
  }

  if (body.team !== undefined) {
    if (body.team !== null && body.team !== 'A' && body.team !== 'B') {
      return badRequest('team must be "A", "B", or null')
    }
    values.push(body.team)
    setClauses.push(`team = ?${values.length}`)
    auditDetails.team = body.team
  }

  if (setClauses.length === 0) return badRequest('No recognized fields to update')

  values.push(id)
  const idPlaceholder = values.length

  const result = await env.DB.prepare(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?${idPlaceholder} AND role != 'owner'`
  )
    .bind(...values)
    .run()

  if (result.meta.changes === 0) {
    const exists = await env.DB.prepare(`SELECT 1 FROM users WHERE id = ?1`).bind(id).first()
    if (!exists) return notFound('User not found')
    return badRequest("The owner's access can't be changed here — transfer ownership first")
  }

  await logAudit(env, data.user.id, 'update', 'users', id, auditDetails)
  return json({ ok: true })
}
