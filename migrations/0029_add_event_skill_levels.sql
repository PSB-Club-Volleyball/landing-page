-- Comma-separated skill levels an event's RSVP is restricted to (same
-- convention as recurrence_days/tags). NULL or empty = every skill level,
-- including no skill level set, may sign up.
ALTER TABLE events ADD COLUMN allowed_skill_levels TEXT;
