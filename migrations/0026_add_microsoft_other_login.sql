-- Adds a third sign-in provider toggle: "microsoft-other", a separate Azure app
-- registration (multi-tenant + personal accounts, on /common) for any non-PSU
-- Microsoft account. The existing "microsoft" toggle now covers only the
-- PSU-tenant registration. Defaults OFF: the provider is inert until its
-- MICROSOFT_OTHER_CLIENT_ID/SECRET secrets and redirect URI are configured, so
-- the owner turns it on from Admin -> Settings once that's done.
ALTER TABLE login_settings ADD COLUMN microsoft_other_enabled INTEGER NOT NULL DEFAULT 0;
