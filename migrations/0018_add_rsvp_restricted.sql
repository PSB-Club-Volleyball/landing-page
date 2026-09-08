-- RSVP restriction: an admin can flag a user (e.g. after repeated no-shows
-- or late cancellations) so their signups never auto-confirm — they always
-- land as 'pending' (or 'waitlist', if the event is already full) even on
-- an event that isn't gated, same as everyone else who requests a spot on a
-- gated event. Matched by email at signup time, same as the rest of the
-- guest-signup flow.
ALTER TABLE users ADD COLUMN rsvp_restricted INTEGER NOT NULL DEFAULT 0;
