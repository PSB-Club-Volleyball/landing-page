-- Reusable signup forms: an admin builds a form once (e.g. "Tournament
-- Signup") and attaches it to any number of events via events.form_id.
-- form_fields keeps stable ids across edits (updated in place, not
-- recreated) since event_signups.answers references fields by id.

CREATE TABLE forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE form_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES forms(id),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,   -- 'text' | 'textarea' | 'select' | 'number' | 'checkbox'
  options TEXT,               -- "|"-separated (labels may contain commas), 'select' only
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_form_fields_form_id ON form_fields(form_id);

ALTER TABLE events ADD COLUMN form_id INTEGER REFERENCES forms(id); -- NULL = signup disabled
ALTER TABLE events ADD COLUMN capacity INTEGER;                     -- NULL = unlimited

CREATE TABLE event_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  answers TEXT,               -- JSON: { "<field_id>": value }
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_signups_event_id ON event_signups(event_id);
CREATE UNIQUE INDEX idx_event_signups_event_email ON event_signups(event_id, email);
