-- Gated RSVP: an admin can require an event's signups to be approved before
-- they're confirmed, instead of every submission being accepted immediately.
-- rsvp_gated only matters when signup_enabled is also on.
--
-- New signups on a gated event start out 'pending' until an admin approves
-- or denies them from the event's signups panel; ungated events keep
-- today's behavior of going straight to 'approved'. decided_at/decided_by
-- mirror the same pattern already used for account approval (users table).

ALTER TABLE events ADD COLUMN rsvp_gated INTEGER NOT NULL DEFAULT 0;

ALTER TABLE event_signups ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'; -- 'pending' | 'approved' | 'denied'
ALTER TABLE event_signups ADD COLUMN decided_at TEXT;
ALTER TABLE event_signups ADD COLUMN decided_by INTEGER REFERENCES users(id);
