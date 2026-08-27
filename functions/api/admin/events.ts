import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { validateRecurrence } from './_lib/recurrence'

// GET /api/admin/events -> every event regardless of status (drafts included),
// joined with the attached form's name and signup count for the table
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env }) => {
  const events = await env.DB.prepare(
    `SELECT e.*, f.name AS form_name,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signup_count
     FROM events e
     LEFT JOIN forms f ON f.id = e.form_id
     ORDER BY e.start_time ASC`
  ).all()
  return json({ events: events.results ?? [] })
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
  form_id?: number | null
  capacity?: number | null
}

// POST /api/admin/events -> create an event (defaults to draft)
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<EventInput>>().catch(() => null)
  if (!body || !body.title || !body.event_type || !body.start_time) {
    return badRequest('title, event_type, and start_time are required')
  }

  const recurrenceError = validateRecurrence(body.recurrence_days, body.recurrence_until)
  if (recurrenceError) return badRequest(recurrenceError)

  const result = await env.DB.prepare(
    `INSERT INTO events (title, description, event_type, start_time, end_time, location_name, location_address, status, recurrence_days, recurrence_until, form_id, capacity)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(
      body.title,
      body.description ?? null,
      body.event_type,
      body.start_time,
      body.end_time ?? null,
      body.location_name ?? null,
      body.location_address ?? null,
      body.status ?? 'draft',
      body.recurrence_days ?? null,
      body.recurrence_until ?? null,
      body.form_id ?? null,
      body.capacity ?? null
    )
    .run()

  const id = Number(result.meta.last_row_id)
  await logAudit(env, data.user.id, 'create', 'events', id, body)
  return json({ id }, { status: 201 })
}
