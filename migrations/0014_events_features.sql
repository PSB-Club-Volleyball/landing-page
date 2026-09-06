-- Waitlist: once a capacitated (ungated) event is full, a new signup joins
-- the waitlist instead of being rejected, and is promoted to 'approved'
-- automatically the moment a spot opens up (an approved signup ahead of it
-- is cancelled or removed). event_signups.status gains 'waitlist' alongside
-- the existing 'pending' | 'approved' | 'denied'.

-- Check-in: admin-recorded attendance, independent of signup status —
-- someone can be signed up and still never show.
ALTER TABLE event_signups ADD COLUMN checked_in_at TEXT;

-- Tags: free-form, comma-separated, admin-entered labels for filtering the
-- public Events page beyond the fixed event_type list (e.g. "beginner
-- friendly", "social").
ALTER TABLE events ADD COLUMN tags TEXT;
