import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { isValidRecurrenceDays, isValidRecurrenceUntil, validateRecurrence } from '../_lib/recurrence'
import { requireOwner } from '../_lib/permissions'

const FIELDS = [
  'title',
  'description',
  'event_type',
  'start_time',
  'end_time',
  'location_name',
  'location_address',
  'status',
  'recurrence_days',
  'recurrence_until',
  'signup_enabled',
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

  const setsDays = updates.includes('recurrence_days')
  const setsUntil = updates.includes('recurrence_until')

  // When only one of the pair is being updated, the both-or-neither invariant can't be
  // checked against a value read in an earlier query — a concurrent PUT could change the
  // other field in between, leaving a stale read stale by the time this write lands.
  // Instead the check is appended to the UPDATE's own WHERE clause, so it's evaluated by
  // SQLite atomically against the row's live value at write time.
  let guardSql = ''
  const guardValues: unknown[] = []

  if (setsDays && setsUntil) {
    const recurrenceError = validateRecurrence(body.recurrence_days, body.recurrence_until)
    if (recurrenceError) return badRequest(recurrenceError)
  } else if (setsDays) {
    if (body.recurrence_days !== null && !isValidRecurrenceDays(body.recurrence_days)) {
      return badRequest('recurrence_days must be a comma-separated list of weekday numbers (0-6)')
    }
    guardSql = ` AND (?G IS NULL) = (recurrence_until IS NULL)`
    guardValues.push(body.recurrence_days)
  } else if (setsUntil) {
    if (body.recurrence_until !== null && !isValidRecurrenceUntil(body.recurrence_until)) {
      return badRequest('recurrence_until must be a YYYY-MM-DD date')
    }
    guardSql = ` AND (?G IS NULL) = (recurrence_days IS NULL)`
    guardValues.push(body.recurrence_until)
  }

  const setClause = updates.map((field, i) => `${field} = ?${i + 1}`).join(', ')
  const values = updates.map((field) => (field === 'signup_enabled' ? (body[field] ? 1 : 0) : body[field]))
  const idPlaceholder = values.length + guardValues.length + 1
  const guardPlaceholder = `?${values.length + 1}`

  const result = await env.DB.prepare(
    `UPDATE events SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?${idPlaceholder}${guardSql.replace('?G', guardPlaceholder)}`
  )
    .bind(...values, ...guardValues, id)
    .run()

  if (result.meta.changes === 0) {
    const exists = await env.DB.prepare(`SELECT 1 FROM events WHERE id = ?1`).bind(id).first()
    if (!exists) return notFound('Event not found')
    return badRequest('recurrence_days and recurrence_until must be set together')
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
