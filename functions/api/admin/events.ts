import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { expandOccurrences, validateRecurrence } from './_lib/recurrence'
import { eventCutoff, EVENT_END_SQL } from '../_lib/time'
import { validateEventInput } from './_lib/events'

// GET /api/admin/events -> every event regardless of status (drafts included),
// joined with the attached form's name and signup count for the table.
// is_past is computed, not stored: an event that's already happened shows as
// "Completed" in the table without touching its draft/published/cancelled
// status, so nothing needs a background job to flip it over.
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env }) => {
  const events = await env.DB.prepare(
    `SELECT e.*, f.name AS form_name,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signup_count,
            ${EVENT_END_SQL} < ?1 AS is_past
     FROM events e
     LEFT JOIN forms f ON f.id = e.form_id
     ORDER BY e.start_time ASC`
  )
    .bind(eventCutoff(0))
    .all<Record<string, unknown> & { signup_enabled: number; rsvp_gated: number; is_past: number }>()
  const withBooleans = (events.results ?? []).map((e) => ({
    ...e,
    signup_enabled: Boolean(e.signup_enabled),
    rsvp_gated: Boolean(e.rsvp_gated),
    released_early: Boolean(e.released_early),
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
  visibility?: 'public' | 'club' | 'eboard'
  recurrence_days?: string | null
  recurrence_until?: string | null
  signup_enabled?: boolean
  rsvp_gated?: boolean
  form_id?: number | null
  capacity?: number | null
  tags?: string | null
  signup_deadline?: string | null
  allowed_skill_levels?: string | null
}

// Allowed values mirror src/types.ts (EventStatus / EventVisibility) and the
// event-type <select> in src/pages/admin/eventForm.tsx.
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<EventInput>>().catch(() => null)
  if (!body || !body.title || !body.event_type || !body.start_time) {
    return badRequest('title, event_type, and start_time are required')
  }

  const inputError = await validateEventInput(env, body)
  if (inputError) return badRequest(inputError)

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

  // `seriesIdSql` is a SQL expression, not a bound value, so a series can be
  // written in one batch (one transaction — a failure or retry can't leave a
  // partial series): the root is inserted, points series_id at itself, and
  // each later occurrence copies series_id from the row inserted just before
  // it (last_insert_rowid() tracks the previous INSERT within the batch).
  const insertOne = (start_time: string, end_time: string | null, seriesIdSql: string) =>
    env.DB.prepare(
      `INSERT INTO events (title, description, event_type, start_time, end_time, location_name, location_address, status, visibility, signup_enabled, rsvp_gated, form_id, capacity, series_id, tags, signup_deadline, allowed_skill_levels)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ${seriesIdSql}, ?14, ?15, ?16)`
    ).bind(
      body.title,
      body.description ?? null,
      body.event_type,
      start_time,
      end_time,
      body.location_name ?? null,
      body.location_address ?? null,
      body.status ?? 'draft',
      body.visibility ?? 'public',
      body.signup_enabled ? 1 : 0,
      body.rsvp_gated ? 1 : 0,
      body.form_id ?? null,
      body.capacity ?? null,
      body.tags?.trim() || null,
      body.signup_deadline || null,
      body.allowed_skill_levels?.trim() || null
    )

  const statements = [insertOne(occurrences[0].start_time, occurrences[0].end_time, 'NULL')]
  if (occurrences.length > 1) {
    statements.push(env.DB.prepare(`UPDATE events SET series_id = id WHERE id = last_insert_rowid()`))
    for (const occ of occurrences.slice(1)) {
      statements.push(
        insertOne(occ.start_time, occ.end_time, '(SELECT series_id FROM events WHERE id = last_insert_rowid())')
      )
    }
  }
  const results = await env.DB.batch(statements)
  const id = Number(results[0].meta.last_row_id)

  await logAudit(env, data.user.id, 'create', 'events', id, { ...body, occurrence_count: occurrences.length })
  return json({ id, occurrence_count: occurrences.length }, { status: 201 })
}
