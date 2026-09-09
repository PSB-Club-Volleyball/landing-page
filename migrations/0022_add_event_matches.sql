-- Matches for an event's schedule. Round robin fills these now; the knockout
-- brackets reuse the same table later (bracket / next_match_id). A match with
-- NULL scores hasn't been played; winner_id is recomputed from scores (or a
-- forfeit) whenever a result is saved.
CREATE TABLE event_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bracket TEXT NOT NULL DEFAULT 'pool',              -- 'pool' (round robin); 'winners' | 'losers' | 'final' later
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,                             -- time-slot index; start = event.start_time + slot * slot_minutes
  court TEXT,                                        -- court label, e.g. '1'
  team_a_id INTEGER REFERENCES event_teams(id) ON DELETE CASCADE,
  team_b_id INTEGER REFERENCES event_teams(id) ON DELETE CASCADE,
  scores TEXT,                                       -- JSON: [[a,b], ...] one pair per set; NULL = not played
  forfeit_team_id INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,
  winner_id INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,     -- computed on save
  next_match_id INTEGER REFERENCES event_matches(id) ON DELETE SET NULL, -- bracket advancement (unused for round robin)
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_matches_event_id ON event_matches(event_id);
