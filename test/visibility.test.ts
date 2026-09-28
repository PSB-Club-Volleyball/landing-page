import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestGet as listEvents } from '../functions/api/events.ts'
import { onRequestGet as getEvent } from '../functions/api/events/[id].ts'
import { onRequestPost as signup } from '../functions/api/events/[id]/signups.ts'
import { onRequestGet as listMedia } from '../functions/api/media.ts'
import { onRequestGet as getMember } from '../functions/api/members/[id].ts'
import { onRequestGet as listMembers } from '../functions/api/members.ts'
import {
  body,
  call,
  seedEvent,
  seedMatch,
  seedMedia,
  seedTeam,
  seedUser,
  setup,
  wallClock,
  type Role,
  type SeededUser,
} from './helpers.ts'

type Viewer = 'anon' | Exclude<Role, 'owner'>
const VIEWERS: Viewer[] = ['anon', 'outsider', 'club_member', 'admin']

// What each viewer may see, by event kind. Drafts are admin-UI only, so
// nobody sees them through the public API — admins included.
const EXPECTED: Record<Viewer, string[]> = {
  anon: ['public'],
  outsider: ['public'],
  club_member: ['public', 'club'],
  admin: ['public', 'club', 'eboard'],
}

// Four events (public/club/eboard published, plus a public draft), each with a
// photo, a played match, and a stripe for `player`; one unattached photo.
function world() {
  const { db, env } = setup()
  const viewers: Record<Exclude<Viewer, 'anon'>, SeededUser> = {
    outsider: seedUser(db, { email: 'outsider@test.example', role: 'outsider' }),
    club_member: seedUser(db, { email: 'member@test.example', role: 'club_member' }),
    admin: seedUser(db, { email: 'admin@test.example', role: 'admin' }),
  }
  const player = seedUser(db, { email: 'player@test.example', role: 'club_member', name: 'Player' })
  const mate = seedUser(db, { email: 'mate@test.example', role: 'club_member', name: 'Mate' })
  const opponent = seedUser(db, { email: 'opp@test.example', role: 'club_member', name: 'Opp' })

  const events: Record<string, number> = {}
  for (const kind of ['public', 'club', 'eboard', 'draft']) {
    const id = seedEvent(db, {
      title: `${kind} event`,
      visibility: kind === 'draft' ? 'public' : kind,
      status: kind === 'draft' ? 'draft' : 'published',
    })
    events[kind] = id
    seedMedia(db, id, `${kind}.jpg`)
    const home = seedTeam(db, id, { name: `${kind} home`, seed: 1, userIds: [player.id, mate.id] })
    const away = seedTeam(db, id, { name: `${kind} away`, seed: 2, userIds: [opponent.id] })
    seedMatch(db, id, { round: 1, slot: 0, team_a_id: home, team_b_id: away, scores: '[[25,20],[25,20]]', winner_id: home })
    db.sqlite
      .prepare(`INSERT INTO stripes (event_id, giver_id, receiver_id, skill) VALUES (?, ?, ?, 'serving')`)
      .run(id, mate.id, player.id)
  }
  seedMedia(db, null, 'unattached.jpg')
  const cookieFor = (v: Viewer) => (v === 'anon' ? undefined : viewers[v].cookie)
  const kindOf = (id: number) => Object.entries(events).find(([, e]) => e === id)?.[0]
  return { db, env, events, player, cookieFor, kindOf }
}

for (const viewer of VIEWERS) {
  test(`GET /api/events lists only what a ${viewer} may see`, async () => {
    const w = world()
    const res = await call(listEvents, w.env, { path: '/api/events', cookie: w.cookieFor(viewer) })
    const { events } = await body<{ events: { id: number }[] }>(res)
    assert.deepEqual(events.map((e) => w.kindOf(e.id)).sort(), [...EXPECTED[viewer]].sort())
  })

  test(`GET /api/events/:id is 404 for events a ${viewer} may not see`, async () => {
    const w = world()
    for (const kind of ['public', 'club', 'eboard', 'draft']) {
      const res = await call(getEvent, w.env, { params: { id: w.events[kind] }, cookie: w.cookieFor(viewer) })
      assert.equal(res.status, EXPECTED[viewer].includes(kind) ? 200 : 404, `${viewer} -> ${kind}`)
    }
  })

  test(`GET /api/media filters event photos for a ${viewer}`, async () => {
    const w = world()
    const res = await call(listMedia, w.env, { path: '/api/media', cookie: w.cookieFor(viewer) })
    const { media } = await body<{ media: { r2_key: string }[] }>(res)
    const expected = [...EXPECTED[viewer].map((k) => `${k}.jpg`), 'unattached.jpg']
    assert.deepEqual(media.map((m) => m.r2_key).sort(), expected.sort())
  })
}

test('GET /api/media?event_id= for a hidden event returns nothing', async () => {
  const w = world()
  const res = await call(listMedia, w.env, { path: `/api/media?event_id=${w.events.club}` })
  assert.deepEqual((await body<{ media: unknown[] }>(res)).media, [])
})

test('signup to a club-only event is 404 for an anonymous visitor', async () => {
  const w = world()
  const res = await call(signup, w.env, {
    params: { id: w.events.club },
    body: { name: 'Anon', email: 'anon@test.example' },
  })
  assert.equal(res.status, 404)
})

for (const viewer of ['outsider', 'club_member', 'admin'] as const) {
  test(`profile results and stripe counts respect a ${viewer}'s visibility`, async () => {
    const w = world()
    const res = await call(getMember, w.env, { params: { id: w.player.id }, cookie: w.cookieFor(viewer) })
    assert.equal(res.status, 200)
    const { member } = await body<{
      member: {
        results: { eventId: number }[]
        summary: { wins: number }
        stripes: { total: number; awards: { event_id: number }[] }
      }
    }>(res)
    const seen = EXPECTED[viewer].length
    assert.deepEqual(member.results.map((r) => w.kindOf(r.eventId)).sort(), [...EXPECTED[viewer]].sort())
    assert.equal(member.summary.wins, seen)
    assert.equal(member.stripes.total, seen)
    assert.deepEqual(member.stripes.awards.map((a) => w.kindOf(a.event_id)).sort(), [...EXPECTED[viewer]].sort())

    const list = await body<{ members: { id: number; wins: number; stripes: Record<string, number> }[] }>(
      await call(listMembers, w.env, { cookie: w.cookieFor(viewer) })
    )
    const card = list.members.find((m) => m.id === w.player.id)
    assert.ok(card)
    assert.equal(card.wins, seen)
    assert.deepEqual(card.stripes, { serving: seen })
  })
}

test('members endpoints require a session', async () => {
  const w = world()
  assert.equal((await call(listMembers, w.env)).status, 401)
  assert.equal((await call(getMember, w.env, { params: { id: w.player.id } })).status, 401)
})

test('series occurrences more than a week out are held back from the list unless released early', async () => {
  const { db, env } = setup()
  const root = seedEvent(db, { title: 'root', start_time: wallClock(24), end_time: wallClock(26) })
  db.sqlite.prepare(`UPDATE events SET series_id = id WHERE id = ?`).run(root)
  const later = seedEvent(db, {
    title: 'later',
    start_time: wallClock(24 * 10),
    end_time: wallClock(24 * 10 + 2),
    series_id: root,
  })
  const early = seedEvent(db, {
    title: 'early',
    start_time: wallClock(24 * 10),
    end_time: wallClock(24 * 10 + 2),
    series_id: root,
    released_early: 1,
  })
  const { events } = await body<{ events: { id: number }[] }>(await call(listEvents, env, { path: '/api/events' }))
  assert.deepEqual(
    events.map((e) => e.id),
    [root, early]
  )
  assert.ok(!events.some((e) => e.id === later))
})

// BUG (functions/api/events.ts): the list filters on COALESCE(end_time,
// start_time) >= now - 2h, but an overnight event stores its end on the start
// date (7 PM - 12:30 AM ends "T00:30" the same day; see eventEndWallClock in
// _lib/time.ts). So the event drops off the upcoming list before it even
// starts. The same raw COALESCE drives ?past=1 and admin is_past.
test(
  'an overnight event under way stays in the upcoming list',
  { todo: 'BUG: events.ts compares the raw overnight end_time instead of eventEndWallClock' },
  async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-10T23:00:00-04:00') })
    const { db, env } = setup()
    const id = seedEvent(db, { start_time: '2026-06-10T19:00', end_time: '2026-06-10T00:30' })
    const { events } = await body<{ events: { id: number }[] }>(await call(listEvents, env, { path: '/api/events' }))
    assert.deepEqual(
      events.map((e) => e.id),
      [id]
    )
  }
)

// Control for the todo above: same frozen clock, an event ending later that
// day is listed, so the mock clock itself isn't what hides the overnight one.
test('an event under way that ends the same day is in the upcoming list (frozen clock)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-10T23:00:00-04:00') })
  const { db, env } = setup()
  const id = seedEvent(db, { start_time: '2026-06-10T19:00', end_time: '2026-06-10T23:30' })
  const { events } = await body<{ events: { id: number }[] }>(await call(listEvents, env, { path: '/api/events' }))
  assert.deepEqual(
    events.map((e) => e.id),
    [id]
  )
})
