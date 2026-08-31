-- Waivers turn out to be an annual, admin-verified thing (e.g. a signed
-- paper form on file), not something a guest self-attests to on every RSVP.
-- Move it from event_signups to users, tracked as "signed for year N" plus
-- who/when marked it, matching the decided_at/decided_by pattern already
-- used for account approval.
ALTER TABLE event_signups DROP COLUMN waiver_accepted;

ALTER TABLE users ADD COLUMN waiver_signed_year INTEGER;   -- e.g. 2026; NULL = not on file
ALTER TABLE users ADD COLUMN waiver_signed_at TEXT;
ALTER TABLE users ADD COLUMN waiver_signed_by INTEGER REFERENCES users(id);
