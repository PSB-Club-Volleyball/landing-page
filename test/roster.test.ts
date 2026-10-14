import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequestGet as publicRoster } from '../functions/api/roster.ts'
import { onRequestPost as createPlayer } from '../functions/api/admin/roster.ts'
import { onRequestPut as updatePlayer } from '../functions/api/admin/roster/[id].ts'
import { body, call, callAdmin, seedUser, setup, sql } from './helpers.ts'

function rosterWorld() {
  const t = setup()
  const admin = seedUser(t.db, { email: 'admin@test.example', role: 'admin' })
  return { ...t, admin }
}

const player = { season: '2026-2027', first_name: 'Avery', last_name: 'Benson', jersey_number: 24 }

test('a player created with a division shows it on the public roster', async () => {
  const w = rosterWorld()
  const res = await callAdmin(createPlayer, w.env, { body: { ...player, division: 'women' }, cookie: w.admin.cookie })
  assert.equal(res.status, 201)
  const { players } = await body<{ players: { last_name: string; division: string | null }[] }>(
    await call(publicRoster, w.env)
  )
  assert.deepEqual(
    players.map((p) => [p.last_name, p.division]),
    [['Benson', 'women']]
  )
})

test('division defaults to null and can be set, changed, and cleared', async () => {
  const w = rosterWorld()
  const { id } = await body<{ id: number }>(await callAdmin(createPlayer, w.env, { body: player, cookie: w.admin.cookie }))
  const division = () => sql(w.db, `SELECT division FROM roster WHERE id = ?`, id)[0].division
  assert.equal(division(), null)
  for (const value of ['men', 'women', null]) {
    const res = await callAdmin(updatePlayer, w.env, {
      method: 'PUT',
      params: { id },
      body: { division: value },
      cookie: w.admin.cookie,
    })
    assert.equal(res.status, 200)
    assert.equal(division(), value)
  }
})

test('an unknown division is 400 on create and update and writes nothing', async () => {
  const w = rosterWorld()
  const created = await callAdmin(createPlayer, w.env, { body: { ...player, division: 'M' }, cookie: w.admin.cookie })
  assert.equal(created.status, 400)
  assert.equal(sql(w.db, `SELECT COUNT(*) AS n FROM roster`)[0].n, 0)

  const { id } = await body<{ id: number }>(
    await callAdmin(createPlayer, w.env, { body: { ...player, division: 'women' }, cookie: w.admin.cookie })
  )
  const updated = await callAdmin(updatePlayer, w.env, {
    method: 'PUT',
    params: { id },
    body: { division: 'coed', jersey_number: 99 },
    cookie: w.admin.cookie,
  })
  assert.equal(updated.status, 400)
  assert.deepEqual(sql(w.db, `SELECT division, jersey_number FROM roster WHERE id = ?`, id), [
    { division: 'women', jersey_number: 24 },
  ])
})
