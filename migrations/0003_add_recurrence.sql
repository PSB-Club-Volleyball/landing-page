-- Weekly recurrence on a single event row: admin sets which weekdays and an
-- end date; the guest page renders the row once with a recurrence summary
-- instead of one row per occurrence (see migrations/0002_seed_open_gyms.sql
-- for the old one-row-per-occurrence approach this replaces going forward).

ALTER TABLE events ADD COLUMN recurrence_days TEXT;   -- comma-separated weekday ints, 0=Sun..6=Sat; NULL = one-time event
ALTER TABLE events ADD COLUMN recurrence_until TEXT;  -- YYYY-MM-DD, last date the series runs; NULL when recurrence_days is NULL
