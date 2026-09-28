import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCookies } from '../functions/api/_lib/cookies.ts'
import { getSessionUser } from '../functions/api/_lib/session.ts'
import {
  decodeIdTokenPayload,
  isPersonalMicrosoftAccount,
  MSA_CONSUMER_TENANT_ID,
} from '../functions/api/auth/_lib/providers.ts'
import { onRequestPost as transferOwner } from '../functions/api/admin/owner/transfer.ts'
import { body, callAdmin, PUBLIC_URL, seedUser, setup, sql } from './helpers.ts'

// --- cookies --------------------------------------------------------------------
test('parseCookies skips a malformed %-escape but keeps the other pairs', (t) => {
  t.mock.method(console, 'warn', () => {})
  assert.deepEqual(parseCookies('bad=%E0%A4%A; session=abc%3D; theme=dark; =orphan; novalue'), {
    session: 'abc=',
    theme: 'dark',
  })
})

test('a malformed unrelated cookie does not break session lookup', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { db, env } = setup()
  const user = seedUser(db, { email: 'a@test.example', role: 'club_member' })
  const request = new Request(PUBLIC_URL, { headers: { cookie: `junk=%zz; ${user.cookie}` } })
  const session = await getSessionUser(request, env)
  assert.equal(session?.id, user.id)
})

test('an expired session is not a session', async () => {
  const { db, env } = setup()
  const user = seedUser(db, { email: 'a@test.example', role: 'club_member' })
  sql(db, `UPDATE sessions SET expires_at = ?`, new Date(Date.now() - 1000).toISOString())
  const session = await getSessionUser(new Request(PUBLIC_URL, { headers: { cookie: user.cookie } }), env)
  assert.equal(session, null)
})

// --- Microsoft personal-account check ---------------------------------------------
function idToken(payload: Record<string, unknown>): string {
  const b64url = (s: string) => Buffer.from(s).toString('base64url')
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.signature`
}

test('decodeIdTokenPayload reads an unpadded base64url payload', () => {
  // '~~~' / '???' encode to base64 '+' / '/' characters, so base64url gives '-' / '_'.
  const payload = { tid: 'x', name: '~~~???', email: 'a@outlook.com' }
  const token = idToken(payload)
  assert.match(token.split('.')[1], /[-_]/)
  assert.doesNotMatch(token, /=/)
  assert.deepEqual(decodeIdTokenPayload(token), payload)
})

test('decodeIdTokenPayload rejects a token without three parts', () => {
  assert.throws(() => decodeIdTokenPayload('only.two'), /Malformed id_token/)
})

test('isPersonalMicrosoftAccount is true only for the consumer (MSA) tenant', () => {
  assert.equal(isPersonalMicrosoftAccount(idToken({ tid: MSA_CONSUMER_TENANT_ID })), true)
  assert.equal(isPersonalMicrosoftAccount(idToken({ tid: '72f988bf-86f1-41af-91ab-2d7cd011db47' })), false)
  assert.equal(isPersonalMicrosoftAccount(idToken({})), false)
})

// --- owner transfer -----------------------------------------------------------------
function ownerWorld() {
  const t = setup()
  const owner = seedUser(t.db, { email: 'owner@test.example', role: 'owner' })
  const admin = seedUser(t.db, { email: 'admin@test.example', role: 'admin' })
  const roles = () => sql(t.db, `SELECT id, role FROM users ORDER BY id`)
  const transfer = (cookie: string, to: unknown) =>
    callAdmin(transferOwner, t.env, { body: { to_user_id: to }, cookie })
  return { ...t, owner, admin, roles, transfer }
}

test('owner transfer by a non-owner admin is 403', async () => {
  const w = ownerWorld()
  const before = w.roles()
  assert.equal((await w.transfer(w.admin.cookie, w.admin.id)).status, 403)
  assert.deepEqual(w.roles(), before)
})

test('owner transfer to yourself is 400', async () => {
  const w = ownerWorld()
  const res = await w.transfer(w.owner.cookie, w.owner.id)
  assert.equal(res.status, 400)
  assert.equal((await body(res)).error, 'Already the owner')
})

test('owner transfer to a missing user is 404 and changes nothing', async () => {
  const w = ownerWorld()
  const before = w.roles()
  assert.equal((await w.transfer(w.owner.cookie, 9999)).status, 404)
  assert.deepEqual(w.roles(), before)
})

test('owner transfer without a numeric target is 400', async () => {
  const w = ownerWorld()
  assert.equal((await w.transfer(w.owner.cookie, 'two')).status, 400)
})

test('owner transfer swaps the roles, leaving exactly one owner', async () => {
  const w = ownerWorld()
  assert.equal((await w.transfer(w.owner.cookie, w.admin.id)).status, 200)
  assert.deepEqual(w.roles(), [
    { id: w.owner.id, role: 'admin' },
    { id: w.admin.id, role: 'owner' },
  ])
})
