-- Signup deadline: optional cutoff after which RSVP/signup closes even if
-- the event itself hasn't happened yet and isn't full. NULL means signup
-- stays open until the event starts, same as before this column existed.
ALTER TABLE events ADD COLUMN signup_deadline TEXT;
