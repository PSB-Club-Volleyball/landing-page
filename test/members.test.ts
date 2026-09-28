import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestGet as listMembers } from '../functions/api/members.ts'
import { onRequestGet as getMember } from '../functions/api/members/[id].ts'
import { body, call, seedEvent, seedMatch, seedSignup, seedTeam, seedUser, setup, sql } from './helpers.ts'

interface Card {
  id: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  winPct: number
}

// Three-team round robin, best of 3: T1 beats T2 2-0 and T3 2-1, T2 beats T3
// 2-0. p1/p2 are linked accounts; p3 is credited through their signup email
// alone (an unlinked team member), as playerResults.ts allows.
function roundRobin() {
  const { db, env } = setup()
  const viewer = seedUser(db, { email: 'viewer@test.example', role: 'club_member' })
  const p1 = seedUser(db, { email: 'p1@test.example', role: 'club_member', name: 'P1' })
  const p2 = seedUser(db, { email: 'p2@test.example', role: 'club_member', name: 'P2' })
  const p3 = seedUser(db, { email: 'p3@test.example', role: 'outsider', name: 'P3' })
  const eventId = seedEvent(db, { play_format: 'round_robin' })
  const t1 = seedTeam(db, eventId, { name: 'T1', seed: 1, userIds: [p1.id] })
  const t2 = seedTeam(db, eventId, { name: 'T2', seed: 2, userIds: [p2.id] })
  const t3 = seedTeam(db, eventId, { name: 'T3', seed: 3 })
  const signupId = seedSignup(db, eventId, { email: 'P3@test.example' })
  sql(db, `INSERT INTO event_team_members (team_id, signup_id) VALUES (?, ?)`, t3, signupId)
  const match = (slot: number, a: number, b: number, scores: string) =>
    seedMatch(db, eventId, { round: 1, slot, team_a_id: a, team_b_id: b, scores })
  match(0, t1, t2, '[[25,20],[25,18]]')
  match(1, t1, t3, '[[25,20],[18,25],[15,10]]')
  match(2, t2, t3, '[[25,15],[25,12]]')
  return { env, viewer, p1, p2, p3 }
}

const EXPECTED = (w: { p1: { id: number }; p2: { id: number }; p3: { id: number } }) => [
  { id: w.p1.id, wins: 2, losses: 0, setsWon: 4, setsLost: 1, winPct: 1 },
  { id: w.p2.id, wins: 1, losses: 1, setsWon: 2, setsLost: 2, winPct: 0.5 },
  { id: w.p3.id, wins: 0, losses: 2, setsWon: 1, setsLost: 4, winPct: 0 },
]

test('GET /api/members returns round-robin W/L and sets, ranked by win rate', async () => {
  const w = roundRobin()
  const { members } = await body<{ members: Card[] }>(await call(listMembers, w.env, { cookie: w.viewer.cookie }))
  const players = members
    .filter((m) => [w.p1.id, w.p2.id, w.p3.id].includes(m.id))
    .map(({ id, wins, losses, setsWon, setsLost, winPct }) => ({ id, wins, losses, setsWon, setsLost, winPct }))
  assert.deepEqual(players, EXPECTED(w))
  const viewer = members.find((m) => m.id === w.viewer.id)
  assert.deepEqual([viewer?.wins, viewer?.losses], [0, 0])
})

test('GET /api/members/:id summary matches the /api/members card for each player', async () => {
  const w = roundRobin()
  for (const expected of EXPECTED(w)) {
    const res = await call(getMember, w.env, { params: { id: expected.id }, cookie: w.viewer.cookie })
    assert.equal(res.status, 200)
    const { member } = await body<{ member: { summary: Omit<Card, 'id'>; results: { teamName: string }[] } }>(res)
    const { wins, losses, setsWon, setsLost, winPct } = member.summary
    assert.deepEqual({ id: expected.id, wins, losses, setsWon, setsLost, winPct }, expected)
    assert.equal(member.results.length, 1)
  }
})
