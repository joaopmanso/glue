-- GLUE Home signs its own window in (ADR 0159): a single-use code it asks for as it opens the window, valid two
-- minutes, traded once by the page in that window for a session as this computer. Stored hashed, like every secret.
CREATE TABLE window_codes (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  home_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
