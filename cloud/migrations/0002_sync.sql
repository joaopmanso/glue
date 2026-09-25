-- Cloud sync (ADR 0040), opt-in per profile: the profile's own data files (collections, tracks,
-- analysis summaries, playlists, tags, imports), gzip + base64, one row per file. No audio.
CREATE TABLE sync_profiles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  stats TEXT,                -- JSON: { collections: [{ id, name, tracks }] }
  files INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, profile_id)
);
CREATE TABLE sync_files (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  path TEXT NOT NULL,        -- relative to profiles/<pid>/
  hash TEXT NOT NULL,        -- SHA-256 of the file's own bytes
  size INTEGER NOT NULL,     -- the file's own size
  data TEXT,                 -- gzip, base64; NULL until uploaded
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, profile_id, path)
);
-- Merged collections (ADR 0040): collections from different devices shown as one. Only the grouping
-- is stored; each device keeps its own data, and the merge is made in the browser when viewing.
CREATE TABLE sync_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, profile_id, collection_id)
);
CREATE INDEX sync_links_group ON sync_links(user_id, group_id);
-- Edits made on another device or browser, waiting for the device that owns the data (ADR 0040).
CREATE TABLE sync_ops (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,   -- the device that applies it
  profile_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  op TEXT NOT NULL,                                                   -- JSON EditOp
  from_device TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX sync_ops_target ON sync_ops(user_id, device_id, profile_id, seq);
