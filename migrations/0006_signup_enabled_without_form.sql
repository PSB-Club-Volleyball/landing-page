-- RSVP no longer requires an attached form — an admin can turn signup on
-- for an event with just name/email collected, and optionally still attach
-- a form for extra fields. form_id stays nullable and independent.

ALTER TABLE events ADD COLUMN signup_enabled INTEGER NOT NULL DEFAULT 0;

-- Every event that already has a form attached was, until now, only able
-- to get there by enabling signup — preserve that state.
UPDATE events SET signup_enabled = 1 WHERE form_id IS NOT NULL;
