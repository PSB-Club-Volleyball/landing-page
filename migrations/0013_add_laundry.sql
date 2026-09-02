-- Tracks shared gear (jerseys, towels, etc.) through a simple two-stage
-- cycle. stage flips dirty -> clean per item, or all at once via the
-- "Did laundry" bulk action.
CREATE TABLE laundry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'dirty' CHECK (stage IN ('clean', 'dirty')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
