import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import { fetchFormFields, validateAnswer } from '../../_lib/forms'
import { randomToken } from '../../_lib/crypto'
import {
  buildCancelUrl,
  sendRsvpConfirmationEmail,
  sendRsvpRequestEmail,
  sendWaitlistEmail,
} from '../../_lib/eventEmails'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SignupInput {
  name: string
  email: string
  answers?: Record<string, string>
  company?: string // honeypot — real users never see or fill this field
}

// POST /api/events/:id/signups -> RSVP or sign up as a guest, no auth.
// Returns a cancel_token the client shows once — a logged-in account whose
// email matches can also cancel without it. When the event is gated
// (rsvp_gated), the signup starts out 'pending' until an admin approves it
// instead of being confirmed immediately. When it's ungated and full, the
// signup instead lands on the waitlist ('waitlist') and is promoted
// automatically once a spot frees up (see _lib/waitlist.ts). Either way a
// confirmation/request/waitlist email goes out right away.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(
    `SELECT id, title, start_time, location_name, status, signup_enabled, rsvp_gated, form_id, capacity,
            signup_deadline, datetime(signup_deadline) < datetime('now') AS deadline_passed
     FROM events WHERE id = ?1`
  )
    .bind(eventId)
    .first<{
      id: number
      title: string
      start_time: string
      location_name: string | null
      status: string
      signup_enabled: number
      rsvp_gated: number
      form_id: number | null
      capacity: number | null
      signup_deadline: string | null
      deadline_passed: number | null
    }>()
  if (!event || event.status !== 'published') return notFound('Event not found')
  if (!event.signup_enabled) return badRequest('Signup is not open for this event')
  if (event.signup_deadline && event.deadline_passed) return badRequest('The signup deadline for this event has passed')

  const body = await request.json<Partial<SignupInput>>().catch(() => null)
  if (!body || !body.name?.trim() || !body.email?.trim()) return badRequest('name and email are required')
  if (!EMAIL_PATTERN.test(body.email.trim())) return badRequest('Enter a valid email')

  // Honeypot: real visitors never populate this hidden field. Pretend success
  // so a bot has no signal to react to, but skip the write entirely.
  if (body.company) return json({ ok: true }, { status: 201 })

  const name = body.name.trim()
  const email = body.email.trim().toLowerCase()

  // A form is optional — signup can be just name/email with no extra fields.
  const fields = event.form_id ? await fetchFormFields(env, event.form_id) : []
  const answers = body.answers ?? {}
  for (const field of fields) {
    const error = validateAnswer(field, answers[field.id])
    if (error) return badRequest(error)
  }

  if (event.form_id) {
    const form = await env.DB.prepare(`SELECT max_responses FROM forms WHERE id = ?1`)
      .bind(event.form_id)
      .first<{ max_responses: number | null }>()
    if (form?.max_responses != null) {
      const responseCount = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM event_signups s JOIN events e ON e.id = s.event_id
         WHERE e.form_id = ?1 AND s.status != 'denied'`
      )
        .bind(event.form_id)
        .first<{ n: number }>()
      if ((responseCount?.n ?? 0) >= form.max_responses) {
        return badRequest('This form is no longer accepting responses')
      }
    }
  }

  // Gated events keep the original "can't even request past capacity"
  // behavior — a waitlist doesn't make sense when every signup still needs
  // a manual decision. Ungated events waitlist instead of rejecting.
  let status: 'pending' | 'approved' | 'waitlist' = 'approved'
  if (event.rsvp_gated) {
    if (event.capacity !== null) {
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM event_signups WHERE event_id = ?1 AND status != 'denied'`
      )
        .bind(eventId)
        .first<{ n: number }>()
      if ((count?.n ?? 0) >= event.capacity) return badRequest('This event is full')
    }
    status = 'pending'
  } else if (event.capacity !== null) {
    const approvedCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM event_signups WHERE event_id = ?1 AND status = 'approved'`
    )
      .bind(eventId)
      .first<{ n: number }>()
    status = (approvedCount?.n ?? 0) < event.capacity ? 'approved' : 'waitlist'
  }

  // A user an admin has flagged as RSVP-restricted (repeated no-shows/late
  // cancellations, say) never gets auto-confirmed, even on an event that
  // isn't gated and has room — their signup still lands as a pending
  // request an admin has to decide on. Already being over capacity still
  // means the waitlist, same as anyone else.
  if (status === 'approved') {
    const restricted = await env.DB.prepare(`SELECT 1 FROM users WHERE LOWER(email) = ?1 AND rsvp_restricted = 1`)
      .bind(email)
      .first()
    if (restricted) status = 'pending'
  }

  const filteredAnswers = Object.fromEntries(
    fields.filter((f) => answers[f.id] !== undefined).map((f) => [f.id, String(answers[f.id])])
  )

  const cancelToken = randomToken(24)
  let signupId: number

  try {
    const result = await env.DB.prepare(
      `INSERT INTO event_signups (event_id, name, email, answers, cancel_token, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
      .bind(
        eventId,
        name,
        email,
        Object.keys(filteredAnswers).length ? JSON.stringify(filteredAnswers) : null,
        cancelToken,
        status
      )
      .run()
    signupId = Number(result.meta.last_row_id)
  } catch (e) {
    // idx_event_signups_event_email is what this is meant to catch (a
    // cancel_token collision could theoretically also trip the unique-index
    // check, but at 24 random bytes that's not a real possibility) — narrow
    // to a unique-constraint violation and let anything else surface.
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return badRequest('You already signed up for this event with that email')
    }
    throw e
  }

  const eventInfo = { title: event.title, start_time: event.start_time, location_name: event.location_name }
  const cancelUrl = buildCancelUrl(env, eventId, signupId, cancelToken)
  if (status === 'pending') {
    await sendRsvpRequestEmail(env, email, name, eventInfo, cancelUrl)
  } else if (status === 'waitlist') {
    await sendWaitlistEmail(env, email, name, eventInfo, cancelUrl)
  } else {
    await sendRsvpConfirmationEmail(env, email, name, eventInfo, cancelUrl)
  }

  return json({ ok: true, id: signupId, cancel_token: cancelToken, status }, { status: 201 })
}
