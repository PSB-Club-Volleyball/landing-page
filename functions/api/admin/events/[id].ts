import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { requireOwner } from '../_lib/permissions'

// Recurrence is create-time only — creating an event with recurrence_days set
// expands it into independent occurrence rows (see events.ts), so a single
// occurrence row has nothing recurrence-related left to edit here.
const FIELDS = [
  'title',
  'description',
  'event_type',
  'start_time',
  'end_time',
  'location_name',
  'location_address',
  'status',
  'visibility',
  'signup_enabled',
  'rsvp_gated',
  'form_id',
  'capacity',
] as const

// PUT /api/admin/events/:id -> partial update, any subset of FIELDS
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const body = await request.json<Record<string, unknown>>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  const updates = FIELDS.filter((field) => field in body)
  if (updates.length === 0) return badRequest('No recognized fields to update')

  const setClause = updates.map((field, i) => `${field} = ?${i + 1}`).join(', ')
  const values = updates.map((field) =>
    field === 'signup_enabled' || field === 'rsvp_gated' ? (body[field] ? 1 : 0) : body[field]
  )

  const result = await env.DB.prepare(
    `UPDATE events SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?${values.length + 1}`
  )
    .bind(...values, id)
    .run()

  if (result.meta.changes === 0) {
    const exists = await env.DB.prepare(`SELECT 1 FROM events WHERE id = ?1`).bind(id).first()
    if (!exists) return notFound('Event not found')
  }

  await logAudit(env, data.user.id, 'update', 'events', id, body)
  return json({ ok: true })
}

// DELETE /api/admin/events/:id -> owner only
export const onRequestDelete: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const result = await env.DB.prepare(`DELETE FROM events WHERE id = ?1`).bind(id).run()
  if (result.meta.changes === 0) return notFound('Event not found')

  await logAudit(env, data.user.id, 'delete', 'events', id)
  return json({ ok: true })
}
