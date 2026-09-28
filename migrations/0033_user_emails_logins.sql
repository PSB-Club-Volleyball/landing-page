-- An account can now hold several emails and several sign-in logins, so one
-- person with a PSU and a Gmail address is one account, an admin can create
-- an account before its owner ever signs in, and two accounts can be merged.
--
-- users.email stays as the account's primary email (display, exports,
-- notices) and is always also a row here. users.provider/provider_sub stay
-- (dropping them would mean rebuilding users under its many FKs) but no
-- lookup reads them any more; an admin-created account that nobody has
-- signed into yet has provider = 'none'.

CREATE TABLE user_emails (
  email TEXT PRIMARY KEY, -- always lowercase
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (email = LOWER(email))
);
CREATE INDEX idx_user_emails_user_id ON user_emails(user_id);

CREATE TABLE user_logins (
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_sub)
);
CREATE INDEX idx_user_logins_user_id ON user_logins(user_id);

INSERT INTO user_emails (email, user_id) SELECT LOWER(email), id FROM users;
INSERT INTO user_logins (provider, provider_sub, user_id)
  SELECT provider, provider_sub, id FROM users WHERE provider <> 'none';

-- Every new account gets its primary email (and, when it came from a real
-- sign-in, its login) in the same statement, so no code path can create a
-- user that sign-in or signup matching can't find. A primary email that
-- another account already holds fails the insert on user_emails' key.
CREATE TRIGGER users_insert_identity AFTER INSERT ON users
BEGIN
  INSERT INTO user_emails (email, user_id) VALUES (LOWER(NEW.email), NEW.id);
  INSERT INTO user_logins (provider, provider_sub, user_id)
    SELECT NEW.provider, NEW.provider_sub, NEW.id WHERE NEW.provider <> 'none';
END;

-- The primary email can only be one of the account's own emails.
CREATE TRIGGER users_primary_email_owned BEFORE UPDATE OF email ON users
WHEN NOT EXISTS (SELECT 1 FROM user_emails WHERE email = LOWER(NEW.email) AND user_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'primary email must be one of the account''s emails');
END;
