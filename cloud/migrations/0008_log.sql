-- The shared collection as a snapshot and a log (ADR 0106). Each push is one row of the log: the songs,
-- playlists and analyses that changed (gzip + base64, never opened here), at the collection's next
-- revision. Now and then a device folds the log into the snapshot (shared_files, the files at that
-- revision) and the log before it goes. `floor`: the revision the snapshot is complete at; a device
-- behind it reads the snapshot first. `bytes`: what the collection stores (the quota, without a scan).
ALTER TABLE shared_collections ADD COLUMN floor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shared_collections ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
-- What's there already is the snapshot, complete at the collection's revision.
UPDATE shared_collections SET floor = seq, bytes = (SELECT COALESCE(SUM(LENGTH(f.data)), 0) FROM shared_files f WHERE f.user_id = shared_collections.user_id AND f.collection_id = shared_collections.id);
CREATE TABLE shared_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  paths TEXT NOT NULL,        -- JSON: the files the entry changes
  data TEXT NOT NULL,         -- gzip, base64: { v: 1, f: { <path>: change } }
  by TEXT,                    -- the device that pushed it
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection_id, rev)
) WITHOUT ROWID;
