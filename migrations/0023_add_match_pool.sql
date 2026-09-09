-- Pool-play-then-bracket: the round-robin matches of each pool are tagged
-- with the pool label so their standings can be computed per pool, and the
-- knockout bracket that follows is seeded from those standings. Bracket
-- matches leave this NULL. `event_teams.pool` (added in 0021) already records
-- which pool a team is in.
ALTER TABLE event_matches ADD COLUMN pool TEXT;
CREATE INDEX idx_event_matches_pool ON event_matches(event_id, pool);
