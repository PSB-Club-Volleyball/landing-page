import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSignIn } from '../functions/api/auth/_lib/accounts.ts'
import type { OAuthProfile } from '../functions/api/auth/_lib/providers.ts'
import { onRequestGet as listUsers, onRequestPost as createUser } from '../functions/api/admin/users.ts'
import { onRequestPut as updateUser } from '../functions/api/admin/users/[id].ts'
import { onRequestPost as addEmail } from '../functions/api/admin/users/[id]/emails.ts'
import { onRequestDelete as removeEmail } from '../functions/api/admin/users/[id]/emails/[email].ts'
import { onRequestGet as mergePreview, onRequestPost as merge } from '../functions/api/admin/users/[id]/merge.ts'
import { onRequestGet as events } from '../functions/api/events.ts'
import { onRequestGet as profile } from '../functions/api/profile.ts'
import { onRequestPost as signup } from '../functions/api/events/[id]/signups.ts'
import { onRequestDelete as cancelSignup } from '../functions/api/events/[id]/signups/[signupId].ts'
import { body, call, callAdmin, seedEvent, seedSignup, seedTeam, seedUser, setup, sql, type TestEnv } from './helpers.ts'

type Db = ReturnType<typeof setup>['db']

function prof(email: string, sub: string, extra: Partial<OAuthProfile> = {}): OAuthProfile {
  return { sub, email, name: 'Prov Name', picture: null, emailVerified: true, ...extra }
}

function signIn(env: TestEnv, provider: string, profile: OAuthProfile, emailIsAuthoritative = true) {
  return resolveSignIn(env as never, { provider, profile, emailIsAuthoritative, isBootstrap: false })
}

const emailsOf = (db: Db, id: number) =>
  sql(db, `SELECT email FROM user_emails WHERE user_id = ? ORDER BY email`, id).map((r) => r.email)
const loginsOf = (db: Db, id: number) =>
  sql(db, `SELECT provider || ':' || provider_sub AS l FROM user_logins WHERE user_id = ? ORDER BY l`, id).map((r) => r.l)

function world() {
  const t = setup()
  const owner = seedUser(t.db, { email: 'owner@test.example', role: 'owner' })
  const admin = seedUser(t.db, { email: 'admin@test.example', role: 'admin' })
  const create = (cookie: string, b: unknown) => callAdmin(createUser, t.env, { body: b, cookie })
  return { ...t, owner, admin, create }
}

// --- schema -----------------------------------------------------------------
test('every account gets its primary email and login rows on insert', () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'Mixed@Test.Example', role: 'outsider' })
  assert.deepEqual(emailsOf(t.db, u.id), ['mixed@test.example'])
  assert.deepEqual(loginsOf(t.db, u.id), ['google:Mixed@Test.Example'])
})

test('the primary email must be one of the account’s emails', () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'a@test.example', role: 'outsider' })
  assert.throws(() => sql(t.db, `UPDATE users SET email = 'nope@test.example' WHERE id = ?`, u.id), /primary email/)
})

// --- sign-in ----------------------------------------------------------------
test('an admin-created account is claimed by the first sign-in with its email', async () => {
  const w = world()
  const res = await w.create(w.admin.cookie, { name: 'Pre Made', email: 'pre@psu.edu', waiver_signed: true })
  assert.equal(res.status, 201)
  const { id } = await body<{ id: number }>(res)

  assert.deepEqual(await signIn(w.env, 'microsoft', prof('pre@psu.edu', 'ms-1')), { userId: id })
  const [row] = sql(w.db, `SELECT name, provider, waiver_signed_year FROM users WHERE id = ?`, id)
  assert.equal(row.name, 'Pre Made', 'the admin-given name survives the claim')
  assert.equal(row.provider, 'microsoft')
  assert.equal(row.waiver_signed_year, new Date().getUTCFullYear())
  assert.deepEqual(loginsOf(w.db, id), ['microsoft:ms-1'])

  // The next sign-in finds it by login.
  assert.deepEqual(await signIn(w.env, 'microsoft', prof('pre@psu.edu', 'ms-1')), { userId: id })
})

test('a signed-in account never gains a login through its emails; merge links sign-ins', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'p@psu.edu', role: 'club_member' })
  sql(t.db, `UPDATE user_logins SET provider = 'microsoft' WHERE user_id = ?`, u.id)
  sql(t.db, `INSERT INTO user_emails (email, user_id) VALUES ('p@gmail.com', ?)`, u.id)
  assert.deepEqual(await signIn(t.env, 'google', prof('p@gmail.com', 'g-2')), { error: 'account_exists' })
  assert.deepEqual(loginsOf(t.db, u.id), ['microsoft:p@psu.edu'])
})

test('an email the provider does not vouch for never links to an existing account', async () => {
  const t = setup()
  seedUser(t.db, { email: 'taken@outlook.com', role: 'club_member' })
  const res = await signIn(t.env, 'microsoft-other', prof('taken@outlook.com', 'msa-9'), false)
  assert.deepEqual(res, { error: 'account_exists' })
  assert.equal(sql(t.db, `SELECT COUNT(*) AS n FROM users`)[0].n, 1)
})

test('an unverified sign-in cannot squat an address a later verified sign-in claims', async () => {
  const t = setup()
  const squat = await signIn(t.env, 'microsoft-other', prof('boss@psu.edu', 'msa-x'), false)
  assert.ok('userId' in squat)
  assert.deepEqual(await signIn(t.env, 'microsoft', prof('boss@psu.edu', 'ms-real')), { error: 'account_exists' })
  assert.deepEqual(loginsOf(t.db, squat.userId), ['microsoft-other:msa-x'])
})

test('an address a sign-in brought is never claimed by a different login (recycled addresses)', async () => {
  const t = setup()
  const old = seedUser(t.db, { email: 'reused@psu.edu', role: 'club_member' })
  assert.deepEqual(await signIn(t.env, 'microsoft', prof('reused@psu.edu', 'new-person')), { error: 'account_exists' })
  assert.deepEqual(loginsOf(t.db, old.id), ['google:reused@psu.edu'])
})

test('a brand-new sign-in creates an outsider with its email and login', async () => {
  const t = setup()
  const res = await signIn(t.env, 'google', prof('new@gmail.com', 'g-new'))
  assert.ok('userId' in res)
  const [row] = sql(t.db, `SELECT role, name FROM users WHERE id = ?`, res.userId)
  assert.deepEqual(row, { role: 'outsider', name: 'Prov Name' })
  assert.deepEqual(emailsOf(t.db, res.userId), ['new@gmail.com'])
})

test('a later sign-in adds a new vouched-for email but never moves the primary', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'old@gmail.com', role: 'outsider' })
  await signIn(t.env, 'google', prof('renamed@gmail.com', 'old@gmail.com'))
  assert.deepEqual(emailsOf(t.db, u.id), ['old@gmail.com', 'renamed@gmail.com'])
  assert.equal(sql(t.db, `SELECT email FROM users WHERE id = ?`, u.id)[0].email, 'old@gmail.com')
})

// --- signups follow every email -----------------------------------------------
test('signups under a secondary email count as the account’s', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'p@psu.edu', role: 'club_member' })
  sql(t.db, `INSERT INTO user_emails (email, user_id) VALUES ('p@gmail.com', ?)`, u.id)
  const eventId = seedEvent(t.db)
  const signupId = seedSignup(t.db, eventId, { email: 'P@gmail.com' })

  const list = await body<{ events: { id: number; my_signup_id: number | null }[] }>(
    await call(events, t.env, { cookie: u.cookie })
  )
  assert.equal(list.events.find((e) => e.id === eventId)?.my_signup_id, signupId)

  const me = await body<{ profile: { upcomingRsvps: { signupId: number }[] } }>(
    await call(profile, t.env, { cookie: u.cookie })
  )
  assert.deepEqual(
    me.profile.upcomingRsvps.map((r) => r.signupId),
    [signupId]
  )

  const res = await call(cancelSignup, t.env, {
    method: 'DELETE',
    path: `/api/events/${eventId}/signups/${signupId}`,
    params: { id: eventId, signupId },
    cookie: u.cookie,
  })
  assert.equal(res.status, 200, await res.clone().text())
})

test('an RSVP restriction applies to every one of the account’s emails', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'p@psu.edu', role: 'club_member' })
  sql(t.db, `UPDATE users SET rsvp_restricted = 1 WHERE id = ?`, u.id)
  sql(t.db, `INSERT INTO user_emails (email, user_id) VALUES ('p@gmail.com', ?)`, u.id)
  const eventId = seedEvent(t.db)
  const res = await call(signup, t.env, { params: { id: eventId }, body: { name: 'P', email: 'p@gmail.com' } })
  assert.equal((await body<{ status: string }>(res)).status, 'pending')
})

// --- creating accounts and managing emails -------------------------------------
test('creating an account: validation, duplicates and the admin-role rule', async () => {
  const w = world()
  assert.equal((await w.create(w.admin.cookie, { name: '', email: 'x@psu.edu' })).status, 400)
  assert.equal((await w.create(w.admin.cookie, { name: 'X', email: 'not-an-email' })).status, 400)
  assert.equal((await w.create(w.admin.cookie, { name: 'X', email: 'x@psu.edu', role: 'admin' })).status, 400)
  const dup = await w.create(w.admin.cookie, { name: 'X', email: 'ADMIN@test.example' })
  assert.equal(dup.status, 409)
  assert.equal((await body<{ user_id: number }>(dup)).user_id, w.admin.id)
  assert.equal((await w.create(w.owner.cookie, { name: 'X', email: 'x@psu.edu', role: 'admin' })).status, 201)
})

test('adding, removing and promoting emails', async () => {
  const w = world()
  const u = seedUser(w.db, { email: 'p@psu.edu', role: 'club_member' })
  const add = (email: string) => callAdmin(addEmail, w.env, { params: { id: u.id }, body: { email }, cookie: w.admin.cookie })
  const drop = (email: string) =>
    callAdmin(removeEmail, w.env, { method: 'DELETE', params: { id: u.id, email }, cookie: w.admin.cookie })
  const primary = (email: string) =>
    callAdmin(updateUser, w.env, { method: 'PUT', params: { id: u.id }, body: { primary_email: email }, cookie: w.admin.cookie })

  assert.equal((await add('P@Gmail.com')).status, 201)
  assert.equal((await add('admin@test.example')).status, 409, 'another account holds it')
  assert.equal((await drop('p@psu.edu')).status, 400, 'the primary email stays')
  assert.equal((await primary('elsewhere@x.com')).status, 400)
  assert.equal((await primary('p@gmail.com')).status, 200)
  assert.equal((await drop('p@psu.edu')).status, 200)
  assert.deepEqual(emailsOf(w.db, u.id), ['p@gmail.com'])

  const listed = await body<{ users: { id: number; emails: string[] }[] }>(
    await callAdmin(listUsers, w.env, { cookie: w.admin.cookie })
  )
  assert.deepEqual(listed.users.find((x) => x.id === u.id)?.emails, ['p@gmail.com'])
})

test("only the owner adds emails to an admin's or the owner's account", async () => {
  const w = world()
  const add = (cookie: string, id: number, email: string) =>
    callAdmin(addEmail, w.env, { params: { id }, body: { email }, cookie })
  assert.equal((await add(w.admin.cookie, w.owner.id, 'owner2@test.example')).status, 400)
  assert.equal((await add(w.admin.cookie, w.admin.id, 'friend@gmail.com')).status, 400)
  assert.equal((await add(w.owner.cookie, w.admin.id, 'friend@gmail.com')).status, 201)
})

// --- merging --------------------------------------------------------------------
function mergeWorld() {
  const w = world()
  const keep = seedUser(w.db, { email: 'p@psu.edu', role: 'outsider', name: 'Pat Kept' })
  const dupe = seedUser(w.db, { email: 'p@gmail.com', role: 'club_member', name: 'Pat Dupe' })
  const other = seedUser(w.db, { email: 'o@psu.edu', role: 'club_member' })
  sql(w.db, `UPDATE users SET waiver_signed_year = 2025 WHERE id = ?`, keep.id)
  sql(w.db, `UPDATE users SET waiver_signed_year = 2026, waiver_signed_by = ?, position = 'Setter' WHERE id = ?`, w.admin.id, dupe.id)
  sql(w.db, `UPDATE users SET dues_paid_by = ? WHERE id = ?`, dupe.id, other.id)
  sql(w.db, `INSERT INTO roster (season, first_name, last_name, user_id) VALUES ('2026', 'Pat', 'Kept', ?)`, keep.id)
  sql(w.db, `INSERT INTO roster (season, first_name, last_name, user_id) VALUES ('2026', 'Pat', 'Dupe', ?)`, dupe.id)
  sql(w.db, `INSERT INTO roster (season, first_name, last_name, user_id) VALUES ('2025', 'Pat', 'Dupe', ?)`, dupe.id)

  const eventId = seedEvent(w.db)
  seedTeam(w.db, eventId, { name: 'A', seed: 1, userIds: [dupe.id, keep.id, other.id] })
  const kudos = (giver: number, receiver: number, skill: string) =>
    sql(w.db, `INSERT INTO stripes (event_id, giver_id, receiver_id, skill) VALUES (?, ?, ?, ?)`, eventId, giver, receiver, skill)
  kudos(keep.id, dupe.id, 'serving') // becomes self-kudos: dropped
  kudos(other.id, dupe.id, 'passing') // moves to keep
  kudos(other.id, keep.id, 'hustle') // duplicate once moved: one stays
  kudos(other.id, dupe.id, 'hustle')
  kudos(dupe.id, other.id, 'setting') // giver moves to keep
  seedSignup(w.db, eventId, { email: 'p@gmail.com' })

  const run = (cookie: string, into: number, from: unknown) =>
    callAdmin(merge, w.env, { params: { id: into }, body: { from_id: from }, cookie })
  return { ...w, keep, dupe, other, eventId, run }
}

test('merge moves everything onto the kept account and deletes the other', async () => {
  const m = mergeWorld()
  const preview = await body<{ moves: Record<string, unknown> }>(
    await callAdmin(mergePreview, m.env, {
      path: `/api/admin/users/${m.keep.id}/merge?from_id=${m.dupe.id}`,
      params: { id: m.keep.id },
      cookie: m.admin.cookie,
    })
  )
  assert.deepEqual(preview.moves, {
    emails: ['p@gmail.com'],
    logins: ['google'],
    team_spots: 0,
    kudos: 2,
    roster_rows: 1,
    signups: 1,
  })

  const res = await m.run(m.admin.cookie, m.keep.id, m.dupe.id)
  assert.equal(res.status, 200, await res.clone().text())

  assert.equal(sql(m.db, `SELECT COUNT(*) AS n FROM users WHERE id = ?`, m.dupe.id)[0].n, 0)
  const [kept] = sql(m.db, `SELECT name, role, position, waiver_signed_year, waiver_signed_by FROM users WHERE id = ?`, m.keep.id)
  assert.deepEqual(kept, {
    name: 'Pat Kept',
    role: 'club_member',
    position: 'Setter',
    waiver_signed_year: 2026,
    waiver_signed_by: m.admin.id,
  })
  assert.deepEqual(emailsOf(m.db, m.keep.id), ['p@gmail.com', 'p@psu.edu'])
  assert.deepEqual(loginsOf(m.db, m.keep.id), ['google:p@gmail.com', 'google:p@psu.edu'])
  assert.equal(sql(m.db, `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`, m.keep.id)[0].n, 2)
  // Both were on team A: one account per event, so the duplicate spot is unlinked.
  assert.equal(sql(m.db, `SELECT COUNT(*) AS n FROM event_team_members WHERE user_id = ?`, m.keep.id)[0].n, 1)
  assert.equal(sql(m.db, `SELECT COUNT(*) AS n FROM event_team_members WHERE user_id IS NULL`)[0].n, 1)
  assert.deepEqual(
    sql(m.db, `SELECT season, last_name, user_id FROM roster ORDER BY season, last_name`),
    [
      { season: '2025', last_name: 'Dupe', user_id: m.keep.id },
      { season: '2026', last_name: 'Kept', user_id: m.keep.id },
    ]
  )
  assert.deepEqual(
    sql(m.db, `SELECT giver_id, receiver_id, skill FROM stripes ORDER BY skill`),
    [
      { giver_id: m.other.id, receiver_id: m.keep.id, skill: 'hustle' },
      { giver_id: m.other.id, receiver_id: m.keep.id, skill: 'passing' },
      { giver_id: m.keep.id, receiver_id: m.other.id, skill: 'setting' },
    ]
  )
  assert.equal(sql(m.db, `SELECT dues_paid_by FROM users WHERE id = ?`, m.other.id)[0].dues_paid_by, m.keep.id)
})

test('merge refuses the owner, yourself, itself, and admins unless you are the owner', async () => {
  const m = mergeWorld()
  const status = async (cookie: string, into: number, from: unknown) => (await m.run(cookie, into, from)).status
  assert.equal(await status(m.admin.cookie, m.keep.id, m.owner.id), 400)
  assert.equal(await status(m.admin.cookie, m.keep.id, m.admin.id), 400)
  assert.equal(await status(m.admin.cookie, m.keep.id, m.keep.id), 400)
  assert.equal(await status(m.admin.cookie, m.owner.id, m.dupe.id), 400)
  const otherAdmin = seedUser(m.db, { email: 'admin3@test.example', role: 'admin' })
  assert.equal(await status(m.admin.cookie, otherAdmin.id, m.other.id), 400, 'merging into an admin is owner-only')
  assert.equal(await status(m.admin.cookie, m.keep.id, 'x'), 400)
  assert.equal(await status(m.admin.cookie, m.keep.id, 99999), 404)
  const second = seedUser(m.db, { email: 'admin2@test.example', role: 'admin' })
  assert.equal(await status(m.admin.cookie, m.keep.id, second.id), 400)
  assert.equal(await status(m.owner.cookie, m.keep.id, second.id), 200)
  assert.equal(sql(m.db, `SELECT role FROM users WHERE id = ?`, m.keep.id)[0].role, 'admin')
})

// --- migration 0033 backfill ----------------------------------------------------
test('migration 0033 gives every existing account one email and one login', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const { readdirSync, readFileSync } = await import('node:fs')
  const dir = new URL('../migrations/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of files.filter((f) => f < '0033')) db.exec(readFileSync(new URL(f, dir), 'utf8'))
  db.exec(`INSERT INTO users (email, name, provider, provider_sub, role) VALUES
    ('A@PSU.edu', 'A', 'microsoft', 'ms-a', 'club_member'),
    ('b@gmail.com', 'B', 'google', 'g-b', 'outsider')`)
  for (const f of files.filter((f) => f >= '0033')) db.exec(readFileSync(new URL(f, dir), 'utf8'))
  assert.deepEqual(
    db.prepare(`SELECT email, user_id FROM user_emails ORDER BY user_id`).all().map((r) => ({ ...r })),
    [
      { email: 'a@psu.edu', user_id: 1 },
      { email: 'b@gmail.com', user_id: 2 },
    ]
  )
  assert.deepEqual(
    db.prepare(`SELECT provider, provider_sub, user_id FROM user_logins ORDER BY user_id`).all().map((r) => ({ ...r })),
    [
      { provider: 'microsoft', provider_sub: 'ms-a', user_id: 1 },
      { provider: 'google', provider_sub: 'g-b', user_id: 2 },
    ]
  )
})

test('merge field rules: the kept account’s later year and a locked skill level win', async () => {
  const w = world()
  const keep = seedUser(w.db, { email: 'k@psu.edu', role: 'club_member' })
  const dupe = seedUser(w.db, { email: 'k@gmail.com', role: 'club_member' })
  sql(w.db, `UPDATE users SET waiver_signed_year = 2026, waiver_signed_by = ?, dues_paid_year = 2025,
             skill_level = 'advanced', skill_level_locked = 0 WHERE id = ?`, w.admin.id, keep.id)
  // "from" verified its own paperwork in an earlier year, and an admin locked its skill level.
  sql(w.db, `UPDATE users SET waiver_signed_year = 2025, waiver_signed_by = ?, dues_paid_year = 2026, dues_paid_by = ?,
             skill_level = 'beginner', skill_level_locked = 1 WHERE id = ?`, dupe.id, dupe.id, dupe.id)
  const res = await callAdmin(merge, w.env, { params: { id: keep.id }, body: { from_id: dupe.id }, cookie: w.admin.cookie })
  assert.equal(res.status, 200, await res.clone().text())
  assert.deepEqual(
    sql(w.db, `SELECT waiver_signed_year, waiver_signed_by, dues_paid_year, dues_paid_by, skill_level, skill_level_locked
               FROM users WHERE id = ?`, keep.id)[0],
    {
      waiver_signed_year: 2026,
      waiver_signed_by: w.admin.id,
      dues_paid_year: 2026,
      dues_paid_by: keep.id, // was "from" itself, re-pointed
      skill_level: 'beginner',
      skill_level_locked: 1,
    }
  )
})

test('one person can’t sign up twice for an event under two of their emails', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'p@psu.edu', role: 'club_member' })
  sql(t.db, `INSERT INTO user_emails (email, user_id) VALUES ('p@gmail.com', ?)`, u.id)
  const eventId = seedEvent(t.db)
  seedSignup(t.db, eventId, { email: 'p@psu.edu' })
  const res = await call(signup, t.env, { params: { id: eventId }, body: { name: 'P', email: 'P@gmail.com' } })
  assert.equal(res.status, 400)
  assert.match((await body<{ error: string }>(res)).error, /already signed up .* as p@psu\.edu/)
})

test('auto-linking links an account to at most one member of an event', async () => {
  const t = setup()
  const u = seedUser(t.db, { email: 'p@psu.edu', role: 'club_member' })
  sql(t.db, `INSERT INTO user_emails (email, user_id) VALUES ('p@gmail.com', ?)`, u.id)
  const eventId = seedEvent(t.db)
  const a = seedSignup(t.db, eventId, { email: 'p@psu.edu' })
  const b = seedSignup(t.db, eventId, { email: 'p@gmail.com' })
  const teamA = seedTeam(t.db, eventId, { name: 'A', seed: 1 })
  const teamB = seedTeam(t.db, eventId, { name: 'B', seed: 2 })
  sql(t.db, `INSERT INTO event_team_members (team_id, signup_id) VALUES (?, ?), (?, ?)`, teamA, a, teamB, b)
  const { autoLinkStatements } = await import('../functions/api/_lib/teamLinks.ts')
  await t.env.DB.batch(autoLinkStatements(t.env as never, eventId) as never)
  assert.deepEqual(
    sql(t.db, `SELECT signup_id, user_id FROM event_team_members ORDER BY id`),
    [
      { signup_id: a, user_id: u.id },
      { signup_id: b, user_id: null },
    ]
  )
})

test('a pre-made account is claimed only through its primary email', async () => {
  const w = world()
  const { id } = await body<{ id: number }>(await w.create(w.admin.cookie, { name: 'Boss', email: 'boss@psu.edu' }))
  sql(w.db, `INSERT INTO user_emails (email, user_id) VALUES ('evil@gmail.com', ?)`, id)
  assert.deepEqual(await signIn(w.env, 'google', prof('evil@gmail.com', 'g-evil')), { error: 'account_exists' })
  assert.deepEqual(await signIn(w.env, 'microsoft', prof('boss@psu.edu', 'ms-boss')), { userId: id })
})
