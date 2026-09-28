// The harness itself: if the D1 stand-in drifts from D1's semantics, every
// other test is testing the wrong thing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb } from './d1.ts'

test('migrations apply cleanly with foreign keys on', () => {
  const db = createTestDb()
  assert.equal(db.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1)
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM login_settings').get()!.n, 1)
})

test('run() reports changes and last_row_id; RETURNING rows come back from first()', async () => {
  const db = createTestDb()
  const insert = db.prepare(`INSERT INTO forms (name) VALUES (?1)`)
  const a = await insert.bind('A').run()
  const b = await insert.bind('B').run()
  assert.equal(a.meta.changes, 1)
  assert.equal(b.meta.last_row_id, a.meta.last_row_id + 1)
  const row = await db.prepare(`DELETE FROM forms WHERE name = ?1 RETURNING id`).bind('B').first<{ id: number }>()
  assert.deepEqual(row, { id: b.meta.last_row_id })
  assert.equal(await db.prepare(`SELECT id FROM forms WHERE name = 'B'`).first(), null)
  assert.equal(await db.prepare(`SELECT name FROM forms WHERE id = ?1`).bind(a.meta.last_row_id).first('name'), 'A')
})

test('batch() is one transaction: a failing statement rolls back the earlier ones', async () => {
  const db = createTestDb()
  const count = () => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM forms`).get()!.n
  const before = count()
  await assert.rejects(
    db.batch([
      db.prepare(`INSERT INTO forms (name) VALUES ('kept?')`),
      db.prepare(`INSERT INTO form_fields (form_id, label, field_type) VALUES (999999, 'x', 'text')`),
    ]),
    /D1_ERROR: FOREIGN KEY constraint failed/
  )
  assert.equal(count(), before)
})

test('binding undefined throws like D1; booleans bind as 0/1 and integers as INTEGER', async () => {
  const db = createTestDb()
  assert.throws(() => db.prepare('SELECT ?1').bind(undefined), /D1_TYPE_ERROR/)
  const row = await db.prepare('SELECT ?1 AS t, ?2 AS f, typeof(?3) AS i, typeof(?4) AS r').bind(true, false, 3, 1.5).first()
  assert.deepEqual(row, { t: 1, f: 0, i: 'integer', r: 'real' })
})
