-- One copy of a collection in GLUE Cloud, the same for every device (ADR 0094). Each file carries the
-- revision it was last written at: the collection's counter, bumped once per push, so "what changed
-- since my cursor" is one indexed query and a push only lands on the revision it was based on.
CREATE TABLE shared_collections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  stats TEXT,                 -- JSON: { tracks, lists }
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE shared_files (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  path TEXT NOT NULL,         -- relative to the collection's folder: collection.json, tracks/ab.json, lists/<id>.json…
  rev INTEGER NOT NULL,
  hash TEXT NOT NULL,         -- SHA-256 of the file's own bytes ('' once deleted)
  size INTEGER NOT NULL,
  data TEXT,                  -- gzip, base64; kept 30 days after a deletion (the bin)
  deleted_at INTEGER,
  updated_by TEXT,            -- the device (computer) that wrote it
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection_id, path)
);
CREATE INDEX shared_files_rev ON shared_files(user_id, collection_id, rev);
