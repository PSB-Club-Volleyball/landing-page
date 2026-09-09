-- Release early: a recurring series occurrence normally only shows on the
-- public Events page starting 7 days before it happens (see events.ts), so
-- a whole season of practices created at once doesn't all show up front.
-- released_early lets an admin override that for one specific occurrence —
-- e.g. a tournament far out that people need to RSVP for well ahead of time
-- — without detaching it from its series_id grouping in the admin table.
ALTER TABLE events ADD COLUMN released_early INTEGER NOT NULL DEFAULT 0;
