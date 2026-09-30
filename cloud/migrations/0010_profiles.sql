-- Profiles are the account's artist aliases (ADR 0113): the same list on every device. Seeded once, from the
-- first computer with a GLUE folder of its own that signs in with none; after that this list is the truth.
-- A deleted alias keeps its row (deleted_at) so a device that was away drops it too.
CREATE TABLE profiles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  bpm_range TEXT,             -- how BPMs show for this alias: NULL (as detected), 'half' or 'full'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, id)
);
