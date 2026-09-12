import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { ensureRosterEntry } from '../_lib/roster'

const SETTABLE_ROLES = ['outsider', 'club_member', 'admin'] as const
type SettableRole = (typeof SETTABLE_ROLES)[number]

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]

interface UsersPatchInput {
  role?: SettableRole
  name?: string
  position?: string | null
  team?: 'A' | 'B' | null
  skill_level?: SkillLevel | null
  skill_level_locked?: boolean
  waiver_signed?: boolean
  dues_paid?: boolean
  rsvp_restricted?: boolean
}

// PUT /api/admin/users/:id  Body: any subset of { role, name, position, team, skill_level, skill_level_locked, waiver_signed, dues_paid, rsvp_restricted }
// Any admin can promote/demote between outsider and club_member, edit a
// member's display name/position/team, and mark/unmark a waiver or dues as
// on file for the current year — the latter is an annual, admin-verified
// thing (e.g. a signed paper form or cash/check received), never something
// the member self-attests to. skill_level is now self-editable by the
// member via /api/profile; an admin can still set it directly here, and
// skill_level_locked takes that self-edit away from a specific user so the
// admin's value sticks. rsvp_restricted flags someone (e.g. repeated
// no-shows/late cancellations) so their future signups never auto-confirm —
// see functions/api/events/[id]/signups.ts. Granting 'admin', or re-roling a
// row that's currently admin, is owner-only — an admin can't create or
// remove other admins. Waiver/dues verification, rsvp_restricted, and basic
// profile fields (name/position/team/skill_level/skill_level_locked) on an
// admin row are NOT guarded — any admin can mark another admin's
// waiver/dues/restriction and edit their basic info, including their own.
// Nobody can set role to 'owner' here or touch the owner's own row; see
// functions/api/admin/owner/transfer.ts for the only way to move ownership.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<UsersPatchInput>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  // Fetched once regardless of which fields are being changed — a role change
  // on a row that's currently admin is owner-only, regardless of which other
  // fields are also present in the same request.
  const target = await env.DB.prepare(`SELECT id, role FROM users WHERE id = ?1`).bind(id).first<{
    id: number
    role: string
  }>()
  if (!target) return notFound('User not found')
  if (target.role === 'admin' && data.user.role !== 'owner' && body.role !== undefined) {
    return badRequest("Only the owner can change an admin's role")
  }

  const setClauses: string[] = []
  const values: unknown[] = []
  const auditDetails: Record<string, unknown> = {}

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

  if (body.skill_level !== undefined) {
    if (body.skill_level !== null && !SKILL_LEVELS.includes(body.skill_level)) {
      return badRequest(`skill_level must be one of ${SKILL_LEVELS.join(', ')}, or null`)
    }
    values.push(body.skill_level)
    setClauses.push(`skill_level = ?${values.length}`)
    auditDetails.skill_level = body.skill_level
  }

  if (body.skill_level_locked !== undefined) {
    values.push(body.skill_level_locked ? 1 : 0)
    setClauses.push(`skill_level_locked = ?${values.length}`)
    auditDetails.skill_level_locked = body.skill_level_locked
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

  if (body.rsvp_restricted !== undefined) {
    values.push(body.rsvp_restricted ? 1 : 0)
    setClauses.push(`rsvp_restricted = ?${values.length}`)
    auditDetails.rsvp_restricted = body.rsvp_restricted
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
    return badRequest("The owner's row can't be changed here — transfer ownership first")
  }

  await logAudit(env, data.user.id, 'update', 'users', id, auditDetails)

  const finalRole = body.role ?? target.role
  if (finalRole === 'club_member' || finalRole === 'admin') {
    await ensureRosterEntry(env, id)
  }

  return json({ ok: true })
}

// DELETE /api/admin/users/:id  Hard-deletes the account and its sessions. Any
// admin can delete an outsider or club member; only the owner can delete
// another admin. Nobody can delete the owner (transfer ownership first) or
// their own account. The roster row is kept but unlinked (roster is season
// history); *_by references elsewhere (waiver/dues verifier, media uploader,
// audit_log actor, event_signups.decided_by) are nulled so the delete
// doesn't fail an FK and doesn't erase unrelated history. A signup's own
// identity keys off email, not user id, so event_signups rows and
// event_team_members are otherwise untouched.
export const onRequestDelete: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const target = await env.DB.prepare(`SELECT id, role FROM users WHERE id = ?1`).bind(id).first<{
    id: number
    role: string
  }>()
  if (!target) return notFound('User not found')

  if (target.role === 'owner') {
    return badRequest("The owner can't be deleted — transfer ownership first")
  }
  if (target.id === data.user.id) {
    return badRequest("You can't delete your own account")
  }
  if (target.role === 'admin' && data.user.role !== 'owner') {
    return badRequest('Only the owner can delete an admin')
  }

  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id),
    env.DB.prepare(`UPDATE roster SET user_id = NULL WHERE user_id = ?1`).bind(id),
    env.DB.prepare(`UPDATE users SET waiver_signed_by = NULL WHERE waiver_signed_by = ?1`).bind(id),
    env.DB.prepare(`UPDATE users SET dues_paid_by = NULL WHERE dues_paid_by = ?1`).bind(id),
    env.DB.prepare(`UPDATE media SET uploaded_by = NULL WHERE uploaded_by = ?1`).bind(id),
    env.DB.prepare(`UPDATE event_signups SET decided_by = NULL WHERE decided_by = ?1`).bind(id),
    env.DB.prepare(`UPDATE audit_log SET user_id = NULL WHERE user_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(id),
  ])

  if (results[results.length - 1].meta.changes === 0) return notFound('User not found')

  await logAudit(env, data.user.id, 'delete', 'users', id)
  return json({ ok: true })
}
