-- User tiers (free / paid / admin) and email + password sign-in (ADR 0041).
-- Everyone starts on paid for now; admin comes only from a Google-verified admin email.
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'paid' CHECK (tier IN ('free', 'paid', 'admin'));
-- The browser stretches the password (PBKDF2, 300k rounds, salted with the email); the server keeps
-- only SHA-256(salt : that key), with its own random salt. No password ever reaches the server.
CREATE TABLE password_logins (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
