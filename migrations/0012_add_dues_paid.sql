-- Dues are an annual, admin-verified thing like the waiver, tracked the
-- same way: "paid for year N" plus who/when marked it.
ALTER TABLE users ADD COLUMN dues_paid_year INTEGER;   -- e.g. 2026; NULL = not on file
ALTER TABLE users ADD COLUMN dues_paid_at TEXT;
ALTER TABLE users ADD COLUMN dues_paid_by INTEGER REFERENCES users(id);
