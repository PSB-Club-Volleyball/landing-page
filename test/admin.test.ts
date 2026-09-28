import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost as createEvent } from '../functions/api/admin/events.ts'
import { onRequestDelete as deleteEvent, onRequestPut as updateEvent } from '../functions/api/admin/events/[id].ts'
import { onRequestPatch as scoreMatch } from '../functions/api/admin/events/[id]/matches/[matchId].ts'
import { onRequestPost as createForm } from '../functions/api/admin/forms.ts'
import { onRequestPut as saveTeams } from '../functions/api/admin/events/[id]/teams.ts'
import {
  body,
  callAdmin,
  seedEvent,
  seedMatch,
  seedMedia,
  seedSignup,
  seedTeam,
  seedUser,
  setup,
  sql,
} from './helpers.ts'

function adminWorld() {
  const t = setup()
  const owner = seedUser(t.db, { email: 'owner@test.example', role: 'owner' })
  const admin = seedUser(t.db, { email: 'admin@test.example', role: 'admin' })
  const member = seedUser(t.db, { email: 'member@test.example', role: 'club_member' })
  return { ...t, owner, admin, member }
}

// --- middleware gate ----------------------------------------------------------
test('admin routes: no session 401, club member 403', async () => {
  const w = adminWorld()
  const input = { title: 'x', event_type: 'social', start_time: '2026-10-05T18:00' }
  assert.equal((await callAdmin(createEvent, w.env, { body: input })).status, 401)
  assert.equal((await callAdmin(createEvent, w.env, { body: input, cookie: w.member.cookie })).status, 403)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM events`)[0].n, 0)
})

// --- event delete -------------------------------------------------------------
test('deleting a series root with signups, media, teams and stripes leaves the DB foreign-key clean', async () => {
  const w = adminWorld()
  const root = seedEvent(w.db, { title: 'root' })
  sql(w.db, `UPDATE events SET series_id = id WHERE id = ?`, root)
  const next = seedEvent(w.db, { title: 'next', series_id: root })
  const last = seedEvent(w.db, { title: 'last', series_id: root })

  const signupId = seedSignup(w.db, root, { email: 'player@test.example' })
  seedSignup(w.db, next, { email: 'player@test.example' })
  const mediaId = seedMedia(w.db, root, 'root.jpg')
  const teamA = seedTeam(w.db, root, { name: 'A', seed: 1, userIds: [w.member.id, w.admin.id] })
  const teamB = seedTeam(w.db, root, { name: 'B', seed: 2 })
  sql(w.db, `INSERT INTO event_team_members (team_id, signup_id) VALUES (?, ?)`, teamB, signupId)
  seedMatch(w.db, root, { round: 1, slot: 0, team_a_id: teamA, team_b_id: teamB })
  sql(w.db, `INSERT INTO stripes (event_id, giver_id, receiver_id, skill) VALUES (?, ?, ?, 'hustle')`, root, w.member.id, w.admin.id)

  const res = await callAdmin(deleteEvent, w.env, { method: 'DELETE', params: { id: root }, cookie: w.owner.cookie })
  assert.equal(res.status, 200)

  assert.deepEqual(sql(w.db, `PRAGMA foreign_key_check`), [])
  assert.deepEqual(sql(w.db, `SELECT id, series_id FROM events ORDER BY id`), [
    { id: next, series_id: next },
    { id: last, series_id: next },
  ])
  assert.deepEqual(sql(w.db, `SELECT event_id FROM media WHERE id = ?`, mediaId), [{ event_id: null }])
  assert.deepEqual(sql(w.db, `SELECT event_id FROM event_signups`), [{ event_id: next }])
  for (const table of ['event_teams', 'event_team_members', 'event_matches', 'stripes']) {
    assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM ${table}`)[0].n, 0, `${table} emptied`)
  }
})

test('deleting an event is owner-only', async () => {
  const w = adminWorld()
  const id = seedEvent(w.db)
  const res = await callAdmin(deleteEvent, w.env, { method: 'DELETE', params: { id }, cookie: w.admin.cookie })
  assert.equal(res.status, 403)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM events`)[0].n, 1)
})

// --- event create ---------------------------------------------------------------
const WEEKLY = {
  title: 'Practice',
  event_type: 'practice',
  start_time: '2026-10-05T18:00', // a Monday
  end_time: '2026-10-05T20:00',
  recurrence_days: '1,3', // Mon, Wed
  recurrence_until: '2026-10-18',
}

test('recurring create writes the whole series with one shared series_id', async () => {
  const w = adminWorld()
  const res = await callAdmin(createEvent, w.env, { body: WEEKLY, cookie: w.admin.cookie })
  assert.equal(res.status, 201)
  const { id, occurrence_count } = await body<{ id: number; occurrence_count: number }>(res)
  assert.equal(occurrence_count, 4)
  const rows = sql(w.db, `SELECT id, start_time, end_time, series_id, status FROM events ORDER BY start_time`)
  assert.deepEqual(
    rows.map((r) => [r.start_time, r.end_time]),
    [
      ['2026-10-05T18:00', '2026-10-05T20:00'],
      ['2026-10-07T18:00', '2026-10-07T20:00'],
      ['2026-10-12T18:00', '2026-10-12T20:00'],
      ['2026-10-14T18:00', '2026-10-14T20:00'],
    ]
  )
  assert.equal(rows[0].id, id)
  assert.ok(rows.every((r) => r.series_id === id && r.status === 'draft'))
})

test('recurring create is atomic: a failure mid-series writes nothing', async () => {
  const w = adminWorld()
  w.db.sqlite.exec(`CREATE TEMP TRIGGER fail_third BEFORE INSERT ON events
    WHEN NEW.start_time = '2026-10-12T18:00' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
  await assert.rejects(callAdmin(createEvent, w.env, { body: WEEKLY, cookie: w.admin.cookie }), /injected failure/)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM events`)[0].n, 0)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM audit_log`)[0].n, 0)
})

const BASE = { title: 'Social', event_type: 'social', start_time: '2026-10-05T18:00' }

for (const [name, patch, message] of [
  ['bad visibility', { visibility: 'secret' }, 'visibility must be one of public, club, eboard'],
  ['bad status', { status: 'archived' }, 'status must be one of draft, published, cancelled'],
  ['bad start_time', { start_time: '2026-10-05 18:00' }, 'start_time must be a YYYY-MM-DDTHH:MM time'],
  ['bad end_time', { end_time: 'tomorrow' }, 'end_time must be a YYYY-MM-DDTHH:MM time or null'],
  ['negative capacity', { capacity: -1 }, 'capacity must be a whole number (0 or more) or null'],
  ['fractional capacity', { capacity: 1.5 }, 'capacity must be a whole number (0 or more) or null'],
] as const) {
  test(`event create rejects ${name} with 400`, async () => {
    const w = adminWorld()
    const res = await callAdmin(createEvent, w.env, { body: { ...BASE, ...patch }, cookie: w.admin.cookie })
    assert.equal(res.status, 400)
    assert.equal((await body(res)).error, message)
    assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM events`)[0].n, 0)
  })
}

test('event create accepts capacity 0', async () => {
  const w = adminWorld()
  const res = await callAdmin(createEvent, w.env, { body: { ...BASE, capacity: 0 }, cookie: w.admin.cookie })
  assert.equal(res.status, 201)
  assert.deepEqual(sql(w.db, `SELECT capacity FROM events`), [{ capacity: 0 }])
})

test('event update rejects a bad visibility and leaves the row alone', async () => {
  const w = adminWorld()
  const id = seedEvent(w.db, { visibility: 'club' })
  const res = await callAdmin(updateEvent, w.env, {
    method: 'PUT',
    params: { id },
    body: { visibility: 'everyone', title: 'Renamed' },
    cookie: w.admin.cookie,
  })
  assert.equal(res.status, 400)
  assert.deepEqual(sql(w.db, `SELECT title, visibility FROM events`), [{ title: 'Test event', visibility: 'club' }])
})

// --- matches ----------------------------------------------------------------------
// Four-team single elimination: semis feed the final's two sides.
function knockout() {
  const w = adminWorld()
  const eventId = seedEvent(w.db, { play_format: 'single_elim' })
  const [t1, t2, t3, t4] = [1, 2, 3, 4].map((seed) => seedTeam(w.db, eventId, { name: `T${seed}`, seed }))
  const wire = (side: number) => ({ winner_to_bracket: 'winners', winner_to_round: 2, winner_to_slot: 0, winner_to_side: side })
  const semi1 = seedMatch(w.db, eventId, { bracket: 'winners', round: 1, slot: 0, team_a_id: t1, team_b_id: t4, ...wire(0) })
  seedMatch(w.db, eventId, { bracket: 'winners', round: 1, slot: 1, team_a_id: t2, team_b_id: t3, ...wire(1) })
  const final = seedMatch(w.db, eventId, {
    bracket: 'winners',
    round: 2,
    slot: 0,
    team_a_id: t1,
    team_b_id: t2,
    scores: '[[25,10],[25,10]]',
    winner_id: t1,
  })
  const patch = (matchId: number, scores: [number, number][]) =>
    callAdmin(scoreMatch, w.env, {
      method: 'PATCH',
      params: { id: eventId, matchId },
      body: { scores, forfeit_team_id: null },
      cookie: w.admin.cookie,
    })
  const finalRow = () => sql(w.db, `SELECT team_a_id, team_b_id, scores, winner_id FROM event_matches WHERE id = ?`, final)[0]
  return { ...w, eventId, t1, t2, t4, semi1, final, patch, finalRow }
}

test('knockout re-save with the same winner keeps the downstream result', async () => {
  const k = knockout()
  const res = await k.patch(k.semi1, [
    [25, 20],
    [20, 25],
    [15, 10],
  ])
  assert.equal(res.status, 200)
  assert.equal((await body(res)).winner_id, k.t1)
  assert.deepEqual(k.finalRow(), { team_a_id: k.t1, team_b_id: k.t2, scores: '[[25,10],[25,10]]', winner_id: k.t1 })
})

test('knockout re-save with a different winner advances them and clears the stale downstream result', async () => {
  const k = knockout()
  const res = await k.patch(k.semi1, [
    [20, 25],
    [20, 25],
  ])
  assert.equal(res.status, 200)
  assert.equal((await body(res)).winner_id, k.t4)
  assert.deepEqual(k.finalRow(), { team_a_id: k.t4, team_b_id: k.t2, scores: null, winner_id: null })
})

test('re-scoring a pool match once the bracket exists is 409', async () => {
  const w = adminWorld()
  const eventId = seedEvent(w.db, { play_format: 'pool_bracket' })
  const a = seedTeam(w.db, eventId, { name: 'A', seed: 1, pool: 'A' })
  const b = seedTeam(w.db, eventId, { name: 'B', seed: 2, pool: 'A' })
  const pool = seedMatch(w.db, eventId, { pool: 'A', round: 1, slot: 0, team_a_id: a, team_b_id: b, scores: '[[25,1],[25,1]]', winner_id: a })
  seedMatch(w.db, eventId, { bracket: 'winners', round: 1, slot: 0, team_a_id: a, team_b_id: b })
  const res = await callAdmin(scoreMatch, w.env, {
    method: 'PATCH',
    params: { id: eventId, matchId: pool },
    body: { scores: [[1, 25], [1, 25]], forfeit_team_id: null },
    cookie: w.admin.cookie,
  })
  assert.equal(res.status, 409)
  assert.deepEqual(sql(w.db, `SELECT scores, winner_id FROM event_matches WHERE id = ?`, pool), [
    { scores: '[[25,1],[25,1]]', winner_id: a },
  ])
})

// --- forms --------------------------------------------------------------------------
const FIELDS = [
  { label: 'Shirt size', field_type: 'select', options: 'S|M|L', required: true },
  { label: 'Details', field_type: 'section' },
  { label: 'Student id', field_type: 'text', pattern: '^\\d{9}$' },
]

test('form create writes the form and every field under its id', async () => {
  const w = adminWorld()
  const before = sql(w.db, `SELECT COUNT(*) AS n FROM form_fields`)[0].n as number
  const res = await callAdmin(createForm, w.env, { body: { name: 'Signup', fields: FIELDS }, cookie: w.admin.cookie })
  assert.equal(res.status, 201)
  const { id } = await body<{ id: number }>(res)
  assert.deepEqual(sql(w.db, `SELECT label, field_type, sort_order FROM form_fields WHERE form_id = ? ORDER BY sort_order`, id), [
    { label: 'Shirt size', field_type: 'select', sort_order: 0 },
    { label: 'Details', field_type: 'section', sort_order: 1 },
    { label: 'Student id', field_type: 'text', sort_order: 2 },
  ])
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM form_fields`)[0].n, before + 3)
})

test('form create is atomic: a failing field insert leaves no form behind', async () => {
  const w = adminWorld()
  const forms = sql(w.db, `SELECT COUNT(*) AS n FROM forms`)[0].n
  w.db.sqlite.exec(`CREATE TEMP TRIGGER fail_field BEFORE INSERT ON form_fields
    WHEN NEW.label = 'Student id' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
  await assert.rejects(callAdmin(createForm, w.env, { body: { name: 'Signup', fields: FIELDS }, cookie: w.admin.cookie }), /injected failure/)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM forms`)[0].n, forms)
})

test('form create rejects an invalid regex pattern with 400', async () => {
  const w = adminWorld()
  const forms = sql(w.db, `SELECT COUNT(*) AS n FROM forms`)[0].n
  const res = await callAdmin(createForm, w.env, {
    body: { name: 'Bad', fields: [{ label: 'Code', field_type: 'text', pattern: '([a-z' }] },
    cookie: w.admin.cookie,
  })
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, '"Code" has an invalid pattern')
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM forms`)[0].n, forms)
})

// --- teams save vs. schedule --------------------------------------------------
function scheduledRoundRobin(w: ReturnType<typeof adminWorld>) {
  const eventId = seedEvent(w.db, { play_format: 'round_robin', format_config: '{"sets_per_match":1,"team_count":2}' })
  const a = seedTeam(w.db, eventId, { name: 'Block Party', seed: 1 })
  const b = seedTeam(w.db, eventId, { name: 'Net Gains', seed: 2 })
  const match = seedMatch(w.db, eventId, { round: 1, slot: 0, team_a_id: a, team_b_id: b, scores: '[[25,20]]', winner_id: a })
  return { eventId, a, b, match }
}
const walkIns = (...names: string[]) => names.map((n) => ({ signup_id: null, display_name: n, is_captain: false }))
const teamsBody = (
  format: string,
  teams: { name: string; members: ReturnType<typeof walkIns> }[],
  extra: Record<string, unknown> = {}
) => ({
  play_format: format,
  // What the admin client always sends, even for formats without a bracket.
  format_config: { team_count: teams.length, bracket_stage: 'single' },
  published: true,
  ...extra,
  teams: teams.map((t, i) => ({ ...t, seed: i + 1, pool: null })),
})

test('renaming teams and moving players keeps the schedule and its scores', async () => {
  const w = adminWorld()
  const { eventId, a, b, match } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: teamsBody('round_robin', [
      { name: 'Block Party II', members: walkIns('Ana', 'Ben') },
      { name: 'Net Gains', members: walkIns('Cy') },
    ]),
  })
  assert.equal(res.status, 200)
  assert.equal((await body(res)).schedule_kept, true)
  assert.deepEqual(sql(w.db, `SELECT id, name FROM event_teams WHERE event_id = ? ORDER BY seed`, eventId), [
    { id: a, name: 'Block Party II' },
    { id: b, name: 'Net Gains' },
  ])
  assert.deepEqual(sql(w.db, `SELECT team_a_id, team_b_id, scores, winner_id FROM event_matches WHERE id = ?`, match), [
    { team_a_id: a, team_b_id: b, scores: '[[25,20]]', winner_id: a },
  ])
  assert.deepEqual(
    sql(w.db, `SELECT display_name FROM event_team_members WHERE team_id = ? ORDER BY id`, a).map((r) => r.display_name),
    ['Ana', 'Ben']
  )
})

test('changing the number of teams rebuilds them and clears the schedule', async () => {
  const w = adminWorld()
  const { eventId } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: teamsBody('round_robin', [
      { name: 'A', members: walkIns('Ana') },
      { name: 'B', members: walkIns('Ben') },
      { name: 'C', members: walkIns('Cy') },
    ], { rebuild_ok: true }),
  })
  assert.equal(res.status, 200)
  assert.equal((await body(res)).schedule_kept, false)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_matches WHERE event_id = ?`, eventId)[0].n, 0)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_teams WHERE event_id = ?`, eventId)[0].n, 3)
})

test('changing the format rebuilds the teams and clears the schedule', async () => {
  const w = adminWorld()
  const { eventId } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: teamsBody('single_elim', [
      { name: 'Block Party', members: walkIns('Ana') },
      { name: 'Net Gains', members: walkIns('Ben') },
    ], { rebuild_ok: true }),
  })
  assert.equal((await body(res)).schedule_kept, false)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_matches WHERE event_id = ?`, eventId)[0].n, 0)
})

test('a rebuild the admin did not confirm is refused and the schedule survives', async () => {
  const w = adminWorld()
  const { eventId, match } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: teamsBody('single_elim', [
      { name: 'Block Party', members: walkIns('Ana') },
      { name: 'Net Gains', members: walkIns('Ben') },
    ]),
  })
  assert.equal(res.status, 409)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_matches WHERE id = ?`, match)[0].n, 1)
})

test('a reshuffle with the same structure still rebuilds when forced', async () => {
  const w = adminWorld()
  const { eventId, a } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: teamsBody('round_robin', [
      { name: 'Block Party', members: walkIns('Cy') },
      { name: 'Net Gains', members: walkIns('Ana') },
    ], { rebuild_ok: true, force_rebuild: true }),
  })
  assert.equal((await body(res)).schedule_kept, false)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_matches WHERE event_id = ?`, eventId)[0].n, 0)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM event_teams WHERE id = ?`, a)[0].n, 0)
})

test('bracket stage only counts for pool play', async () => {
  const w = adminWorld()
  const { eventId } = scheduledRoundRobin(w)
  const res = await callAdmin(saveTeams, w.env, {
    cookie: w.admin.cookie,
    params: { id: eventId },
    body: {
      ...teamsBody('round_robin', [
        { name: 'Block Party', members: walkIns('Ana') },
        { name: 'Net Gains', members: walkIns('Ben') },
      ]),
      format_config: { team_count: 2, bracket_stage: 'double' },
    },
  })
  assert.equal(res.status, 200)
  assert.equal((await body(res)).schedule_kept, true)
})
