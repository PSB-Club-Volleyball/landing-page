-- Stripes: teammate-awarded recognition for a skill or trait, earned at one
-- event. A player awards a teammate a stripe from the event page, only while
-- the event's window is open (start through 12 hours after it ends — see
-- functions/api/_lib/stripes.ts). Both sides are accounts: a walk-in or
-- unlinked team member can't give or receive one. Deleting the giver's
-- account keeps the stripe (giver_id goes NULL, shown as a former member)
-- so other players' counts don't drop; deleting the receiver removes it.
CREATE TABLE stripes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  giver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL CHECK (skill IN ('serving', 'passing', 'setting', 'hitting', 'blocking', 'digging', 'hustle', 'teammate')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (giver_id <> receiver_id),
  -- One stripe per skill per teammate per event.
  UNIQUE (event_id, giver_id, receiver_id, skill)
);
CREATE INDEX idx_stripes_receiver_id ON stripes(receiver_id);
