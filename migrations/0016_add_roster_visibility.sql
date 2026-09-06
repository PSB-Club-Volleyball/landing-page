-- Owner-only toggle to hide the public player roster (e.g. before tryouts
-- are finalized) without touching the underlying roster data — the Board
-- section of the same page is unaffected.
ALTER TABLE login_settings ADD COLUMN roster_visible INTEGER NOT NULL DEFAULT 1;
