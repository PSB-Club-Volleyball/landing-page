import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

const SETTABLE_ROLES = ['outsider', 'club_member', 'admin'] as const
type SettableRole = (typeof SETTABLE_ROLES)[number]

interface UsersPatchInput {
  status?: 'approved' | 'denied'
  role?: SettableRole
  name?: string
  position?: string | null
  team?: 'A' | 'B' | null
  waiver_signed?: boolean
  dues_paid?: boolean
}

// PUT /api/admin/users/:id  Body: any subset of { status, role, name, position, team, waiver_signed, dues_paid }
// Any admin can approve/deny, promote/demote between outsider and
// club_member, edit a member's display name/position/team, and mark/unmark a
// waiver or dues as on file for the current year — the latter is an annual,
// admin-verified thing (e.g. a signed paper form or cash/check received),
// never something the member self-attests to. Granting 'admin', or touching
// status/role/waiver/dues on a row that's currently admin, is owner-only —
// an admin can't create or remove other admins, or approve/deny, re-role, or
// re-verify another admin's (or their own) waiver/dues. Basic profile fields
// (name/position/team) on an admin row are NOT guarded — any admin can edit
// any user's basic info, including another admin's.
// Nobody can set role to 'owner' here or touch the owner's own row; see
// functions/api/admin/owner/transfer.ts for the only way to move ownership.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<UsersPatchInput>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  // Fetched once regardless of which fields are being changed — status,
  // role, waiver, and dues on a row that's currently admin are owner-only,
  // regardless of which other fields are also present in the same request.
  const target = await env.DB.prepare(`SELECT id, role FROM users WHERE id = ?1`).bind(id).first<{
    id: number
    role: string
  }>()
  if (!target) return notFound('User not found')
  if (target.role === 'admin' && data.user.role !== 'owner') {
    const touchesGuardedField =
      body.role !== undefined || body.status !== undefined || body.waiver_signed !== undefined || body.dues_paid !== undefined
    if (touchesGuardedField) {
      return badRequest("Only the owner can change an admin's access, role, waiver, or dues status")
    }
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

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return badRequest('name cannot be empty')
    values.push(name)
    setClauses.push(`name = ?${values.length}`)
    auditDetails.name = name
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

  if (body.waiver_signed !== undefined) {
    if (body.waiver_signed) {
      values.push(new Date().getUTCFullYear())
      setClauses.push(`waiver_signed_year = ?${values.length}`)
      values.push(data.user.id)
      setClauses.push(`waiver_signed_by = ?${values.length}`)
      setClauses.push(`waiver_signed_at = CURRENT_TIMESTAMP`)
    } else {
      setClauses.push(`waiver_signed_year = NULL`, `waiver_signed_by = NULL`, `waiver_signed_at = NULL`)
    }
    auditDetails.waiver_signed = body.waiver_signed
  }

  if (body.dues_paid !== undefined) {
    if (body.dues_paid) {
      values.push(new Date().getUTCFullYear())
      setClauses.push(`dues_paid_year = ?${values.length}`)
      values.push(data.user.id)
      setClauses.push(`dues_paid_by = ?${values.length}`)
      setClauses.push(`dues_paid_at = CURRENT_TIMESTAMP`)
    } else {
      setClauses.push(`dues_paid_year = NULL`, `dues_paid_by = NULL`, `dues_paid_at = NULL`)
    }
    auditDetails.dues_paid = body.dues_paid
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
