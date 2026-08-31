-- Single-row settings table gating which OAuth providers accept new sign-ins.
-- Owner-only toggle in the admin console (functions/api/admin/settings.ts);
-- enforced in functions/api/auth/[provider]/start.ts before redirecting to
-- the provider's consent screen. Disabling a provider doesn't touch existing
-- sessions or users who signed in with it previously.
CREATE TABLE login_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  google_enabled INTEGER NOT NULL DEFAULT 1,
  microsoft_enabled INTEGER NOT NULL DEFAULT 1
);
INSERT INTO login_settings (id, google_enabled, microsoft_enabled) VALUES (1, 1, 1);
