import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import { fetchFormFields } from '../../_lib/forms'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SignupInput {
  name: string
  email: string
  answers?: Record<string, string>
  company?: string // honeypot — real users never see or fill this field
}

// POST /api/events/:id/signups -> RSVP or sign up as a guest, no auth
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(
    `SELECT id, status, form_id, capacity FROM events WHERE id = ?1`
  )
    .bind(eventId)
    .first<{ id: number; status: string; form_id: number | null; capacity: number | null }>()
  if (!event || event.status !== 'published') return notFound('Event not found')
  if (!event.form_id) return badRequest('Signup is not open for this event')

  const body = await request.json<Partial<SignupInput>>().catch(() => null)
  if (!body || !body.name?.trim() || !body.email?.trim()) return badRequest('name and email are required')
  if (!EMAIL_PATTERN.test(body.email.trim())) return badRequest('Enter a valid email')

  // Honeypot: real visitors never populate this hidden field. Pretend success
  // so a bot has no signal to react to, but skip the write entirely.
  if (body.company) return json({ ok: true }, { status: 201 })

  const fields = await fetchFormFields(env, event.form_id)
  const answers = body.answers ?? {}
  for (const field of fields) {
    if (field.required && !String(answers[field.id] ?? '').trim()) {
      return badRequest(`"${field.label}" is required`)
    }
  }

  if (event.capacity !== null) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM event_signups WHERE event_id = ?1`)
      .bind(eventId)
      .first<{ n: number }>()
    if ((count?.n ?? 0) >= event.capacity) return badRequest('This event is full')
  }

  const filteredAnswers = Object.fromEntries(
    fields.filter((f) => answers[f.id] !== undefined).map((f) => [f.id, String(answers[f.id])])
  )

  try {
    await env.DB.prepare(
      `INSERT INTO event_signups (event_id, name, email, answers) VALUES (?1, ?2, ?3, ?4)`
    )
      .bind(
        eventId,
        body.name.trim(),
        body.email.trim().toLowerCase(),
        Object.keys(filteredAnswers).length ? JSON.stringify(filteredAnswers) : null
      )
      .run()
  } catch (e) {
    // idx_event_signups_event_email is the only thing that can reject this insert
    // besides an infra failure — narrow to that case and let anything else surface.
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return badRequest('You already signed up for this event with that email')
    }
    throw e
  }

  return json({ ok: true }, { status: 201 })
}
