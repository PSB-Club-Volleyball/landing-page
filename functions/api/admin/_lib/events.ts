import type { Env } from '../../_lib/env'

const EVENT_STATUSES = ['draft', 'published', 'cancelled']
const EVENT_VISIBILITIES = ['public', 'club', 'eboard']
const EVENT_TYPES = ['practice', 'tournament', 'open_gym', 'game', 'social']
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
const TEXT_FIELDS = ['description', 'location_name', 'location_address', 'tags', 'allowed_skill_levels'] as const

// Checks every event field present in `body` (absent keys are skipped, so the
// partial PUT in events/[id].ts shares it). Returns an error message, or null.
export async function validateEventInput(env: Env, body: Record<string, unknown>): Promise<string | null> {
  if ('title' in body && (typeof body.title !== 'string' || !body.title.trim())) return 'title must be a non-empty string'
  if ('event_type' in body && !EVENT_TYPES.includes(body.event_type as string)) {
    return `event_type must be one of ${EVENT_TYPES.join(', ')}`
  }
  if ('status' in body && !EVENT_STATUSES.includes(body.status as string)) {
    return `status must be one of ${EVENT_STATUSES.join(', ')}`
  }
  if ('visibility' in body && !EVENT_VISIBILITIES.includes(body.visibility as string)) {
    return `visibility must be one of ${EVENT_VISIBILITIES.join(', ')}`
  }
  if ('start_time' in body && (typeof body.start_time !== 'string' || !WALL_CLOCK.test(body.start_time))) {
    return 'start_time must be a YYYY-MM-DDTHH:MM time'
  }
  for (const field of ['end_time', 'signup_deadline'] as const) {
    const v = body[field]
    if (field in body && v !== null && (typeof v !== 'string' || !WALL_CLOCK.test(v))) {
      return `${field} must be a YYYY-MM-DDTHH:MM time or null`
    }
  }
  for (const field of TEXT_FIELDS) {
    if (field in body && body[field] !== null && typeof body[field] !== 'string') return `${field} must be a string or null`
  }
  if ('capacity' in body && body.capacity !== null && (!Number.isInteger(body.capacity) || (body.capacity as number) < 0)) {
    // 0 is meaningful: every signup goes to the waitlist.
    return 'capacity must be a whole number (0 or more) or null'
  }
  if ('form_id' in body && body.form_id !== null) {
    if (!Number.isInteger(body.form_id)) return 'form_id must be a form id or null'
    const form = await env.DB.prepare(`SELECT 1 FROM forms WHERE id = ?1`).bind(body.form_id).first()
    if (!form) return 'form_id does not match an existing form'
  }
  return null
}

// POST /api/admin/events -> create an event (defaults to draft). When
// recurrence_days + recurrence_until are given, this creates one real row
// per weekly occurrence instead of a single recurring row — each occurrence
// is an independent event with its own signups, sharing a series_id purely
// so the admin table can show them as a group.
