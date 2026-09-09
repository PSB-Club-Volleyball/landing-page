-- Teams for an event: an admin splits the approved signup list into balanced
-- teams for a tournament / practice / open gym / game. play_format records
-- what happens after teams are formed ('none' = just rosters); the schedule /
-- bracket / score tables that the other formats need land in a later
-- migration. format_config is a JSON blob of per-format knobs (team count,
-- courts, sets per match, pools, ...), shaped by the client.
ALTER TABLE events ADD COLUMN play_format TEXT;   -- NULL = not set; 'none' | 'round_robin' | 'pool_bracket' | 'single_elim' | 'double_elim'
ALTER TABLE events ADD COLUMN format_config TEXT; -- JSON, NULL until a format is chosen

CREATE TABLE event_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0,
  pool TEXT,                                      -- pool label, e.g. 'A' (pool_bracket only; NULL otherwise)
  -- Teams stay admin-only until published as a set — the public event page
  -- shows the Teams tab only once published = 1.
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_teams_event_id ON event_teams(event_id);
-- One row per (event, seed) — lets the wholesale-replace PUT insert members
-- against their team via a (event_id, seed) lookup inside one atomic batch.
CREATE UNIQUE INDEX idx_event_teams_event_seed ON event_teams(event_id, seed);

CREATE TABLE event_team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  -- A member is either a linked signup or a walk-in typed in by hand.
  signup_id INTEGER REFERENCES event_signups(id) ON DELETE CASCADE, -- NULL for a walk-in
  display_name TEXT,                              -- set for a walk-in (and as an optional override); NULL means "use the signup's name"
  is_captain INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_event_team_members_team_id ON event_team_members(team_id);
