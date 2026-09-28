import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import { EMAIL_PATTERN, fetchFormFields, validateAnswer } from '../../_lib/forms'
import { randomToken } from '../../_lib/crypto'
import {
  buildCancelUrl,
  sendRsvpConfirmationEmail,
  sendRsvpRequestEmail,
  sendWaitlistEmail,
} from '../../_lib/eventEmails'
import { getSessionUser } from '../../_lib/session'
import { isAtLeast } from '../../_lib/roles'
import { eventCutoff, eventEndWallClock } from '../../_lib/time'

const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

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
// instead of being confirmed immediately — capacity doesn't block a
// request, only how many an admin can approve (see admin/events/[id]/release.ts).
// When it's ungated and full, the signup instead lands on the waitlist
// ('waitlist') and is promoted automatically once a spot frees up (see
// _lib/waitlist.ts). Either way a confirmation/request/waitlist email goes
// out right away.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(
    `SELECT id, title, start_time, end_time, location_name, status, visibility, signup_enabled, rsvp_gated, form_id, capacity,
            signup_deadline, allowed_skill_levels
     FROM events WHERE id = ?1`
  )
    .bind(eventId)
    .first<{
      id: number
      title: string
      start_time: string
      end_time: string | null
      location_name: string | null
      status: string
      visibility: string
      signup_enabled: number
      rsvp_gated: number
      form_id: number | null
      capacity: number | null
      signup_deadline: string | null
      allowed_skill_levels: string | null
    }>()
  if (!event || event.status !== 'published') return notFound('Event not found')

  // Event IDs are guessable, so a non-public event must reject a signup from
  // anyone who couldn't see it in the first place — otherwise visibility is
  // just a display filter, not real access control. This runs before any
  // other check (e.g. signup_enabled) that could otherwise distinguish "this
  // event exists but isn't open" from "not found" and leak its existence.
  if (event.visibility !== 'public') {
    const sessionUser = await getSessionUser(request, env)
    const role = sessionUser?.role ?? 'outsider'
    const minRole = event.visibility === 'eboard' ? 'admin' : 'club_member'
    if (!isAtLeast(role, minRole)) return notFound('Event not found')
  }

  if (!event.signup_enabled) return badRequest('Signup is not open for this event')
  // Event times and signup_deadline are Eastern wall-clock strings (see
  // _lib/time.ts), so compare them against Eastern "now", not SQLite's UTC
  // datetime('now'). With no deadline, walk-ins can still RSVP to an event
  // that's under way; only a finished event is closed.
  const now = eventCutoff(0)
  if (eventEndWallClock(event) <= now) return badRequest('This event has already ended')
  if (event.signup_deadline && event.signup_deadline.slice(0, 16) <= now) {
    return badRequest('Deadline for registration passed')
  }

  const body = await request.json<Partial<SignupInput>>().catch(() => null)
  if (!body || !body.name?.trim() || !body.email?.trim()) return badRequest('name and email are required')
  if (!EMAIL_PATTERN.test(body.email.trim())) return badRequest('Enter a valid email')

  // Honeypot: real visitors never populate this hidden field. Pretend success
  // so a bot has no signal to react to, but skip the write entirely.
  if (body.company) return json({ ok: true }, { status: 201 })

  const name = body.name.trim()
  const email = body.email.trim().toLowerCase()

  // Skill-level restricted event: only an account with a skill level set
  // that isn't in the allowed list gets blocked — no matching account, or
  // one with no skill level set yet, always goes through.
  if (event.allowed_skill_levels) {
    const allowed = event.allowed_skill_levels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (allowed.length > 0) {
      const account = await env.DB.prepare(
        `SELECT u.skill_level FROM user_emails ue JOIN users u ON u.id = ue.user_id WHERE ue.email = ?1`
      )
        .bind(email)
        .first<{ skill_level: string | null }>()
      if (account?.skill_level && !allowed.includes(account.skill_level)) {
        return badRequest(`This event is restricted to: ${allowed.map((l) => SKILL_LEVEL_LABELS[l] ?? l).join(', ')}`)
      }
    }
  }

  // A form is optional — signup can be just name/email with no extra fields.
  const fields = event.form_id ? await fetchFormFields(env, event.form_id) : []
  const answers = body.answers ?? {}
  for (const field of fields) {
    const error = validateAnswer(field, answers[field.id])
    if (error) return badRequest(error)
  }

  // A form's max_responses is a cap across every event using that form.
  let maxResponses: number | null = null
  if (event.form_id) {
    const form = await env.DB.prepare(`SELECT max_responses FROM forms WHERE id = ?1`)
      .bind(event.form_id)
      .first<{ max_responses: number | null }>()
    // forms/[id].ts refuses to delete a form still attached to an event.
    if (!form) throw new Error(`Event ${eventId} references missing form ${event.form_id}`)
    maxResponses = form.max_responses
  }

  // A user an admin has flagged as RSVP-restricted (repeated no-shows/late
  // cancellations, say) never gets auto-confirmed, even on an event that
  // isn't gated and has room — their signup still lands as a pending
  // request an admin has to decide on. Already being over capacity still
  // means the waitlist, same as anyone else.
  const restricted = event.rsvp_gated
    ? null
    : await env.DB.prepare(
        `SELECT 1 FROM user_emails ue JOIN users u ON u.id = ue.user_id WHERE ue.email = ?1 AND u.rsvp_restricted = 1`
      )
        .bind(email)
        .first()

  // Gated events always take the request as 'pending', regardless of
  // capacity — every signup needs a manual decision anyway, and the admin
  // tooling (release/decide) already fills 'approved' up to capacity and
  // waitlists the rest from the pending pool. Rejecting requests once the
  // pending count reaches capacity would block people from ever getting in
  // that queue in the first place. Ungated events waitlist instead of
  // rejecting once approved seats run out.
  const roomStatus = event.rsvp_gated || restricted ? 'pending' : 'approved'
  const capacity = event.rsvp_gated ? null : event.capacity

  const filteredAnswers = Object.fromEntries(
    fields.filter((f) => answers[f.id] !== undefined).map((f) => [f.id, String(answers[f.id])])
  )

  // One seat per person: an account can hold several emails, and the unique
  // (event, email) index only stops the same address twice.
  const sameAccount = await env.DB.prepare(
    `SELECT s.email FROM event_signups s
     JOIN user_emails ue ON ue.email = LOWER(s.email)
     WHERE s.event_id = ?1 AND LOWER(s.email) <> ?2
       AND ue.user_id = (SELECT user_id FROM user_emails WHERE email = ?2)`
  )
    .bind(eventId, email)
    .first<{ email: string }>()
  if (sameAccount) return badRequest(`You're already signed up for this event as ${sameAccount.email}`)

  const cancelToken = randomToken(24)
  let inserted: { id: number; status: 'pending' | 'approved' | 'waitlist' } | null

  // The capacity and max_responses checks run inside the INSERT itself, so
  // two signups racing for the last seat can't both be approved and a full
  // form can't be overfilled — D1 runs each statement atomically. No row
  // back means the form's max_responses was already reached.
  try {
    inserted = await env.DB.prepare(
      `INSERT INTO event_signups (event_id, name, email, answers, cancel_token, status)
       SELECT ?1, ?2, ?3, ?4, ?5,
              CASE WHEN ?7 IS NULL
                     OR (SELECT COUNT(*) FROM event_signups WHERE event_id = ?1 AND status = 'approved') < ?7
                   THEN ?6 ELSE 'waitlist' END
       WHERE ?8 IS NULL
          OR (SELECT COUNT(*) FROM event_signups s JOIN events e ON e.id = s.event_id
              WHERE e.form_id = ?9 AND s.status != 'denied') < ?8
       RETURNING id, status`
    )
      .bind(
        eventId,
        name,
        email,
        Object.keys(filteredAnswers).length ? JSON.stringify(filteredAnswers) : null,
        cancelToken,
        roomStatus,
        capacity,
        maxResponses,
        event.form_id
      )
      .first<{ id: number; status: 'pending' | 'approved' | 'waitlist' }>()
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
  if (!inserted) return badRequest('This form is no longer accepting responses')
  const signupId = inserted.id
  const status = inserted.status

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
