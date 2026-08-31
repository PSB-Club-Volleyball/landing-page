-- Recurring events used to be stored as a single row (recurrence_days +
-- recurrence_until) that the public page rendered as one "Recurring" card
-- with one shared signup pool. Going forward, a recurring event is expanded
-- server-side at creation time into one real row per occurrence, so each
-- week's practice/open gym is its own event with its own signups. series_id
-- links occurrence rows created together (it equals the id of the first
-- occurrence) purely for the admin table; the public page never sees it.
--
-- recurrence_days/recurrence_until stay on the table as create-time input
-- fields the API reads but no longer persists on any row.

ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES events(id);
CREATE INDEX idx_events_series_id ON events(series_id);

-- Backfill: any pre-existing row still summarizing a weekly recurrence gets
-- expanded into its real occurrence rows now, the same way a new recurring
-- event created through the admin UI would be.
WITH RECURSIVE occ(series_event_id, occ_date, until_date) AS (
  SELECT id, date(start_time), recurrence_until
  FROM events
  WHERE recurrence_days IS NOT NULL
  UNION ALL
  SELECT series_event_id, date(occ_date, '+1 day'), until_date
  FROM occ
  WHERE date(occ_date, '+1 day') <= until_date
)
INSERT INTO events (
  title, description, event_type, start_time, end_time, location_name,
  location_address, status, signup_enabled, form_id, capacity, series_id
)
SELECT
  e.title, e.description, e.event_type,
  occ.occ_date || substr(e.start_time, 11),
  CASE WHEN e.end_time IS NOT NULL THEN occ.occ_date || substr(e.end_time, 11) END,
  e.location_name, e.location_address, e.status, e.signup_enabled, e.form_id, e.capacity, e.id
FROM occ
JOIN events e ON e.id = occ.series_event_id
WHERE occ.occ_date <> date(e.start_time)
  AND EXISTS (
    SELECT 1 FROM json_each('[' || e.recurrence_days || ']')
    WHERE CAST(value AS INTEGER) = CAST(strftime('%w', occ.occ_date) AS INTEGER)
  );

UPDATE events SET series_id = id WHERE recurrence_days IS NOT NULL;
UPDATE events SET recurrence_days = NULL, recurrence_until = NULL WHERE series_id IS NOT NULL;
