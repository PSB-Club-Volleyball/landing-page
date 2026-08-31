import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { expandOccurrences, validateRecurrence } from './_lib/recurrence'

// GET /api/admin/events -> every event regardless of status (drafts included),
// joined with the attached form's name and signup count for the table.
// is_past is computed, not stored: an event that's already happened shows as
// "Completed" in the table without touching its draft/published/cancelled
// status, so nothing needs a background job to flip it over.
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env }) => {
  const events = await env.DB.prepare(
    `SELECT e.*, f.name AS form_name,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signup_count,
            datetime(COALESCE(e.end_time, e.start_time)) < datetime('now') AS is_past
     FROM events e
     LEFT JOIN forms f ON f.id = e.form_id
     ORDER BY e.start_time ASC`
  ).all<Record<string, unknown> & { signup_enabled: number; is_past: number }>()
  const withBooleans = (events.results ?? []).map((e) => ({
    ...e,
    signup_enabled: Boolean(e.signup_enabled),
    is_past: Boolean(e.is_past),
  }))
  return json({ events: withBooleans })
}

interface EventInput {
  title: string
  description?: string | null
  event_type: string
  start_time: string
  end_time?: string | null
  location_name?: string | null
  location_address?: string | null
  status?: 'draft' | 'published' | 'cancelled'
  recurrence_days?: string | null
  recurrence_until?: string | null
  signup_enabled?: boolean
  form_id?: number | null
  capacity?: number | null
}

// POST /api/admin/events -> create an event (defaults to draft). When
// recurrence_days + recurrence_until are given, this creates one real row
// per weekly occurrence instead of a single recurring row — each occurrence
// is an independent event with its own signups, sharing a series_id purely
// so the admin table can show them as a group.
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<EventInput>>().catch(() => null)
  if (!body || !body.title || !body.event_type || !body.start_time) {
    return badRequest('title, event_type, and start_time are required')
  }

  const recurrenceError = validateRecurrence(body.recurrence_days, body.recurrence_until)
  if (recurrenceError) return badRequest(recurrenceError)

  let occurrences: { start_time: string; end_time: string | null }[]
  if (body.recurrence_days && body.recurrence_until) {
    const expanded = expandOccurrences(body.start_time, body.end_time ?? null, body.recurrence_days, body.recurrence_until)
    if (!expanded || expanded.length === 0) {
      return badRequest('recurrence_until must be on/after the start date and produce a reasonable number of occurrences')
    }
    occurrences = expanded
  } else {
    occurrences = [{ start_time: body.start_time, end_time: body.end_time ?? null }]
  }

  const insertOne = (start_time: string, end_time: string | null, seriesId: number | null) =>
    env.DB.prepare(
      `INSERT INTO events (title, description, event_type, start_time, end_time, location_name, location_address, status, signup_enabled, form_id, capacity, series_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    )
      .bind(
        body.title,
        body.description ?? null,
        body.event_type,
        start_time,
        end_time,
        body.location_name ?? null,
        body.location_address ?? null,
        body.status ?? 'draft',
        body.signup_enabled ? 1 : 0,
        body.form_id ?? null,
        body.capacity ?? null,
        seriesId
      )
      .run()

  const first = await insertOne(occurrences[0].start_time, occurrences[0].end_time, null)
  const id = Number(first.meta.last_row_id)

  if (occurrences.length > 1) {
    await env.DB.prepare(`UPDATE events SET series_id = ?1 WHERE id = ?1`).bind(id).run()
    for (const occ of occurrences.slice(1)) {
      await insertOne(occ.start_time, occ.end_time, id)
    }
  }

  await logAudit(env, data.user.id, 'create', 'events', id, { ...body, occurrence_count: occurrences.length })
  return json({ id, occurrence_count: occurrences.length }, { status: 201 })
}
