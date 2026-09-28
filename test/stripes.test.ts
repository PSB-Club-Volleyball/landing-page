import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestDelete as takeBack, onRequestPost as award } from '../functions/api/events/[id]/stripes.ts'
import { stripeWindow } from '../functions/api/_lib/stripes.ts'
import { body, call, seedEvent, seedTeam, seedUser, setup, sql, wallClock, type SeededUser, type TestEnv } from './helpers.ts'

// --- window (pure, fixed clock) --------------------------------------------
// June dates are EDT (UTC-4), so the instant below is 2026-06-10 19:30 Eastern.
const at = (eastern: string) => new Date(`${eastern}:00-04:00`)

test('stripe window is upcoming before the start', () => {
  const w = stripeWindow({ start_time: '2026-06-10T19:00', end_time: '2026-06-10T21:00' }, at('2026-06-10T18:59'))
  assert.equal(w.state, 'upcoming')
  assert.equal(w.closes_in_minutes, null)
})

test('stripe window opens at the start and closes 12h after the end', () => {
  const event = { start_time: '2026-06-10T19:00', end_time: '2026-06-10T21:00' }
  const open = stripeWindow(event, at('2026-06-10T19:00'))
  assert.equal(open.state, 'open')
  assert.equal(open.opens_at, '2026-06-10T19:00')
  assert.equal(open.closes_at, '2026-06-11T09:00')
  assert.equal(open.closes_in_minutes, 14 * 60)
  assert.equal(stripeWindow(event, at('2026-06-11T08:59')).state, 'open')
  assert.equal(stripeWindow(event, at('2026-06-11T09:00')).state, 'closed')
})

test('stripe window: an overnight end (before the start on the same date) is the next day', () => {
  const w = stripeWindow({ start_time: '2026-06-10T19:00', end_time: '2026-06-10T00:30' }, at('2026-06-11T12:00'))
  assert.equal(w.closes_at, '2026-06-11T12:30')
  assert.equal(w.state, 'open')
})

test('stripe window: no end time closes 12h after the start', () => {
  const w = stripeWindow({ start_time: '2026-06-10T19:00', end_time: null }, at('2026-06-11T07:00'))
  assert.equal(w.closes_at, '2026-06-11T07:00')
  assert.equal(w.state, 'closed')
})

// --- endpoint ---------------------------------------------------------------
interface Fixture {
  env: TestEnv
  db: ReturnType<typeof setup>['db']
  eventId: number
  giver: SeededUser
  mate: SeededUser
  rival: SeededUser
}

// One event (open window by default) with giver + mate on one published team
// and rival on another.
function fixture(eventOverrides: Record<string, string | number | null> = {}): Fixture {
  const { db, env } = setup()
  const eventId = seedEvent(db, { start_time: wallClock(-3), end_time: wallClock(3), ...eventOverrides })
  const giver = seedUser(db, { email: 'giver@test.example', role: 'club_member' })
  const mate = seedUser(db, { email: 'mate@test.example', role: 'club_member' })
  const rival = seedUser(db, { email: 'rival@test.example', role: 'club_member' })
  seedTeam(db, eventId, { name: 'A', seed: 1, userIds: [giver.id, mate.id] })
  seedTeam(db, eventId, { name: 'B', seed: 2, userIds: [rival.id] })
  return { env, db, eventId, giver, mate, rival }
}

function send(handler: typeof award, f: Fixture, receiverId: number, skill: string) {
  return call(handler, f.env, {
    method: handler === award ? 'POST' : 'DELETE',
    params: { id: f.eventId },
    cookie: f.giver.cookie,
    body: { receiver_id: receiverId, skill },
  })
}

test('stripe to a teammate is awarded; a duplicate is 409', async () => {
  const f = fixture()
  assert.equal((await send(award, f, f.mate.id, 'serving')).status, 201)
  const dup = await send(award, f, f.mate.id, 'serving')
  assert.equal(dup.status, 409)
  assert.equal(sql(f.db, `SELECT COUNT(*) AS n FROM stripes`)[0].n, 1)
})

test('stripe to someone on another team is forbidden', async () => {
  const f = fixture()
  const res = await send(award, f, f.rival.id, 'serving')
  assert.equal(res.status, 403)
  assert.equal((await body(res)).error, 'You can only give kudos to a teammate from this event')
})

test('stripe to an unpublished team mate is forbidden', async () => {
  const f = fixture()
  sql(f.db, `UPDATE event_teams SET published = 0`)
  assert.equal((await send(award, f, f.mate.id, 'serving')).status, 403)
})

test('stripe to yourself is 400', async () => {
  const f = fixture()
  assert.equal((await send(award, f, f.giver.id, 'serving')).status, 400)
})

test('unknown stripe skill is 400', async () => {
  const f = fixture()
  const res = await send(award, f, f.mate.id, 'juggling')
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'Unknown skill')
})

test('stripe without a session is 401', async () => {
  const f = fixture()
  const res = await call(award, f.env, { params: { id: f.eventId }, body: { receiver_id: f.mate.id, skill: 'serving' } })
  assert.equal(res.status, 401)
})

test('taking a stripe back is 200, then 404', async () => {
  const f = fixture()
  assert.equal((await send(award, f, f.mate.id, 'hustle')).status, 201)
  assert.equal((await send(takeBack, f, f.mate.id, 'hustle')).status, 200)
  assert.equal((await send(takeBack, f, f.mate.id, 'hustle')).status, 404)
})

test('stripes before the event starts are forbidden', async () => {
  const f = fixture({ start_time: wallClock(2), end_time: wallClock(4) })
  const res = await send(award, f, f.mate.id, 'serving')
  assert.equal(res.status, 403)
  assert.equal((await body(res)).error, 'Kudos open when the event starts')
})

test('locked event (12h+ after end) rejects both award and take-back', async () => {
  const f = fixture({ start_time: wallClock(-20), end_time: wallClock(-14) })
  f.db.sqlite
    .prepare(`INSERT INTO stripes (event_id, giver_id, receiver_id, skill) VALUES (?, ?, ?, 'passing')`)
    .run(f.eventId, f.giver.id, f.mate.id)
  const awarded = await send(award, f, f.mate.id, 'serving')
  assert.equal(awarded.status, 403)
  assert.equal((await body(awarded)).error, 'Kudos for this event are locked')
  assert.equal((await send(takeBack, f, f.mate.id, 'passing')).status, 403)
  assert.equal(sql(f.db, `SELECT COUNT(*) AS n FROM stripes`)[0].n, 1)
})

test('stripes on a cancelled event are forbidden', async () => {
  const f = fixture({ status: 'cancelled' })
  assert.equal((await send(award, f, f.mate.id, 'serving')).status, 403)
})
