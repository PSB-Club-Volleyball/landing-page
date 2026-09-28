import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost as signup } from '../functions/api/events/[id]/signups.ts'
import { onRequestDelete as cancelSignup } from '../functions/api/events/[id]/signups/[signupId].ts'
import { body, call, seedEvent, seedSignup, sentEmails, setup, sql, wallClock, type TestEnv } from './helpers.ts'

function rsvp(env: TestEnv, eventId: number, email: string, extra: Record<string, unknown> = {}) {
  return call(signup, env, { params: { id: eventId }, body: { name: email.split('@')[0], email, ...extra } })
}

function cancel(env: TestEnv, eventId: number, signupId: number, token: string) {
  return call(cancelSignup, env, {
    method: 'DELETE',
    path: `/api/events/${eventId}/signups/${signupId}?token=${encodeURIComponent(token)}`,
    params: { id: eventId, signupId },
  })
}

async function rsvpStatus(env: TestEnv, eventId: number, email: string): Promise<string> {
  const res = await rsvp(env, eventId, email)
  assert.equal(res.status, 201, await res.clone().text())
  return (await body<{ status: string }>(res)).status
}

function statusOf(t: ReturnType<typeof setup>, email: string): string {
  const rows = sql(t.db, `SELECT status FROM event_signups WHERE email = ?`, email)
  assert.equal(rows.length, 1, `expected one signup for ${email}`)
  return rows[0].status as string
}

test('signup before the Eastern deadline is accepted', async () => {
  const t = setup()
  const id = seedEvent(t.db, { signup_deadline: wallClock(2) })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'approved')
})

test('signup after the Eastern deadline is rejected', async () => {
  const t = setup()
  const id = seedEvent(t.db, { signup_deadline: wallClock(-3) })
  const res = await rsvp(t.env, id, 'a@test.example')
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'Deadline for registration passed')
})

test('signup for an event that already ended is rejected', async () => {
  const t = setup()
  const id = seedEvent(t.db, { start_time: wallClock(-5), end_time: wallClock(-3) })
  const res = await rsvp(t.env, id, 'a@test.example')
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'This event has already ended')
})

test('walk-in signup while the event is under way is accepted', async () => {
  const t = setup()
  const id = seedEvent(t.db, { start_time: wallClock(-3), end_time: wallClock(3) })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'approved')
})

test('capacity 1: the second signup lands on the waitlist', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 1 })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'approved')
  assert.equal(await rsvpStatus(t.env, id, 'b@test.example'), 'waitlist')
})

test('capacity 0: every signup is waitlisted', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 0 })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'waitlist')
  assert.equal(await rsvpStatus(t.env, id, 'b@test.example'), 'waitlist')
})

test('gated event: signups start pending regardless of capacity', async () => {
  const t = setup()
  const id = seedEvent(t.db, { rsvp_gated: 1, capacity: 1 })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'pending')
  assert.equal(await rsvpStatus(t.env, id, 'b@test.example'), 'pending')
})

test('duplicate email (any case) on the same event is rejected', async () => {
  const t = setup()
  const id = seedEvent(t.db)
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'approved')
  const res = await rsvp(t.env, id, 'A@Test.Example')
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'You already signed up for this event with that email')
  assert.equal(sql(t.db, `SELECT COUNT(*) AS n FROM event_signups`)[0].n, 1)
})

test("form max_responses caps signups across every event using the form; denied ones don't count", async () => {
  const t = setup()
  const formId = Number(
    t.db.sqlite.prepare(`INSERT INTO forms (name, max_responses) VALUES ('Capped', 2)`).run().lastInsertRowid
  )
  const first = seedEvent(t.db, { form_id: formId })
  const second = seedEvent(t.db, { form_id: formId })
  seedSignup(t.db, first, { email: 'denied@test.example', status: 'denied' })
  assert.equal(await rsvpStatus(t.env, first, 'a@test.example'), 'approved')
  assert.equal(await rsvpStatus(t.env, second, 'b@test.example'), 'approved')
  const res = await rsvp(t.env, second, 'c@test.example')
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'This form is no longer accepting responses')
})

test('cancelling an approved signup promotes the oldest waitlister exactly once', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 1 })
  const a = await body<{ id: number; cancel_token: string }>(await rsvp(t.env, id, 'a@test.example'))
  assert.equal(await rsvpStatus(t.env, id, 'b@test.example'), 'waitlist')
  assert.equal(await rsvpStatus(t.env, id, 'c@test.example'), 'waitlist')
  sentEmails.length = 0

  const res = await cancel(t.env, id, a.id, a.cancel_token)
  assert.equal(res.status, 200)
  assert.equal(statusOf(t, 'b@test.example'), 'approved')
  assert.equal(statusOf(t, 'c@test.example'), 'waitlist')
  assert.equal(sentEmails.filter((e) => e.to === 'b@test.example').length, 1, 'one promotion email to b')

  // Replaying the same cancel finds nothing and promotes nobody else.
  const again = await cancel(t.env, id, a.id, a.cancel_token)
  assert.equal(again.status, 404)
  assert.equal(statusOf(t, 'c@test.example'), 'waitlist')
})

test('cancelling a waitlisted signup does not promote anyone', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 1 })
  assert.equal(await rsvpStatus(t.env, id, 'a@test.example'), 'approved')
  const b = await body<{ id: number; cancel_token: string }>(await rsvp(t.env, id, 'b@test.example'))
  assert.equal(await rsvpStatus(t.env, id, 'c@test.example'), 'waitlist')
  assert.equal((await cancel(t.env, id, b.id, b.cancel_token)).status, 200)
  assert.equal(statusOf(t, 'c@test.example'), 'waitlist')
})

test('cancelling on a cancelled event does not promote the waitlist', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 1 })
  const a = await body<{ id: number; cancel_token: string }>(await rsvp(t.env, id, 'a@test.example'))
  assert.equal(await rsvpStatus(t.env, id, 'b@test.example'), 'waitlist')
  sql(t.db, `UPDATE events SET status = 'cancelled' WHERE id = ?`, id)
  assert.equal((await cancel(t.env, id, a.id, a.cancel_token)).status, 200)
  assert.equal(statusOf(t, 'b@test.example'), 'waitlist')
})

test('cancelling on a finished event does not promote the waitlist', async () => {
  const t = setup()
  const id = seedEvent(t.db, { capacity: 1, start_time: wallClock(-5), end_time: wallClock(-3) })
  const a = seedSignup(t.db, id, { email: 'a@test.example', cancel_token: 'tok-a' })
  seedSignup(t.db, id, { email: 'b@test.example', status: 'waitlist' })
  assert.equal((await cancel(t.env, id, a, 'tok-a')).status, 200)
  assert.equal(statusOf(t, 'b@test.example'), 'waitlist')
})

test('cancelling with a wrong token and no matching session is forbidden', async () => {
  const t = setup()
  const id = seedEvent(t.db)
  const a = seedSignup(t.db, id, { email: 'a@test.example', cancel_token: 'tok-a' })
  assert.equal((await cancel(t.env, id, a, 'not-the-token')).status, 403)
  assert.equal(statusOf(t, 'a@test.example'), 'approved')
})
