import type { AdminEventRow, EventStatus, EventVisibility } from '../../types'

// Pure (non-component) helpers for the event form — kept out of eventForm.tsx
// so that file can be components-only.

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  public: 'Public',
  club: 'Club members only',
  eboard: 'E-board only',
}

// Shifts a "YYYY-MM-DDTHH:MM" wall-clock string by a number of calendar days
// (month/year rollover included), leaving the time-of-day untouched. Done in
// UTC purely as a trick to get correct calendar-date math without the local
// timezone nudging the date across midnight — the string itself never
// carries a timezone (see EventDateTimeFields).
export function shiftDateTime(dt: string, days: number): string {
  const [datePart, timePart] = dt.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + days)
  return `${utc.toISOString().slice(0, 10)}T${timePart ?? ''}`
}

export const emptyDraft = {
  title: '',
  event_type: 'practice',
  start_time: '',
  end_time: '',
  location_name: '',
  location_address: '',
  status: 'draft' as EventStatus,
  visibility: 'public' as EventVisibility,
  description: '',
  recurrence_days: '' as string, // comma-separated weekday ints, e.g. "2,4,6"; empty = one-time
  recurrence_until: '',
  signup_enabled: false,
  rsvp_gated: false,
  form_id: '' as string, // '' = none chosen yet
  capacity: '' as string,
  tags: '' as string, // comma-separated
  signup_deadline: '' as string, // '' = no deadline, signup stays open until the event starts
}
export type Draft = typeof emptyDraft

export function toInput(draft: Draft) {
  return {
    title: draft.title,
    event_type: draft.event_type,
    start_time: draft.start_time,
    end_time: draft.end_time || null,
    location_name: draft.location_name || null,
    location_address: draft.location_address || null,
    status: draft.status,
    visibility: draft.visibility,
    description: draft.description || null,
    recurrence_days: draft.recurrence_days || null,
    recurrence_until: draft.recurrence_days ? draft.recurrence_until || null : null,
    signup_enabled: draft.signup_enabled,
    rsvp_gated: draft.signup_enabled && draft.rsvp_gated,
    form_id: draft.signup_enabled && draft.form_id ? Number(draft.form_id) : null,
    capacity: draft.signup_enabled && draft.capacity ? Number(draft.capacity) : null,
    signup_deadline: draft.signup_enabled && draft.signup_deadline ? draft.signup_deadline : null,
    tags: draft.tags
      ? draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .join(', ') || null
      : null,
  }
}

export function eventToDraft(e: AdminEventRow): Draft {
  return {
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time ?? '',
    location_name: e.location_name ?? '',
    location_address: e.location_address ?? '',
    status: e.status,
    visibility: e.visibility,
    description: e.description ?? '',
    // Recurrence is create-time only (see events.ts) — an existing row never carries it.
    recurrence_days: '',
    recurrence_until: '',
    signup_enabled: e.signup_enabled,
    rsvp_gated: e.rsvp_gated,
    form_id: e.form_id !== null ? String(e.form_id) : '',
    capacity: e.capacity !== null ? String(e.capacity) : '',
    tags: e.tags ?? '',
    signup_deadline: e.signup_deadline ?? '',
  }
}

// start_time/end_time stay stored as combined "YYYY-MM-DDTHH:MM" strings —
// these split/recombine them so the form can show one date plus separate
// start/end time inputs instead of two full datetimes.
export function splitDateTime(dt: string): { date: string; time: string } {
  if (!dt) return { date: '', time: '' }
  const [date, time] = dt.split('T')
  return { date, time: time ?? '' }
}

export function combineDateTime(date: string, time: string): string {
  return date || time ? `${date}T${time}` : ''
}

export function toggleWeekday(recurrence_days: string, day: number): string {
  const days = recurrence_days ? recurrence_days.split(',').map(Number) : []
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
  return next.join(',')
}
