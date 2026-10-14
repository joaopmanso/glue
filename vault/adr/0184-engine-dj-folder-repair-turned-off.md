---
status: accepted
date: 2026-10-14
---
# 0184. Turn off the folder repair in Engine DJ's databases

## Context
- **What 0183 did:** GLUE Home 0.74.0 put every Engine DJ folder's songs in the Collection and its drives as GLUE had
  inferred Engine DJ keeps them (`enginedb::fix_folders`, after every sync).
- **What happened (the user, 2026-10-14):** after its first sync, Engine DJ locked every playlist. The user could make
  a playlist and name it, and then nothing more: no move, no rename, no delete, no songs. GLUE kept working.
- **Why isn't known yet.** The rule was read from copies of the databases, and the repair was checked on those copies
  (lists, their order and songs untouched, the chains intact, SQLite's integrity check clean). Engine DJ evidently
  checks something the rule doesn't capture.

## Decision
- **0.74.1 turns the repair off:** `dj_fix_folders` is no longer called.
- **The code stays:** `enginedb::fix_folders`, `folders_own`, and their unit test, to look into against the user's
  databases as they are now (`DatabaseC5`, `DatabaseF5`).
- **The mirror still leaves folders' songs alone.** That part changes nothing in Engine DJ's databases.
- **The user restores** the backups GLUE Home made before the repair (its cache, `library/dj-backups/<uuid>/`).

## Alternatives considered
- **Keep the repair and fix what it got wrong:** there's no way to tell what that is without Engine DJ's own word. The
  user's playlists can't stay locked meanwhile.

## Consequences
- **A lesson:** a change to Engine DJ's databases that GLUE has inferred, not seen Engine DJ make, gets tried on a copy
  in Engine DJ itself before it ships. Here that means the user opening a repaired copy in Engine DJ.
- **Waiting:** the folders on F: stay as GLUE left them, and "test123" stays stuck in "2022".
- **A weak point:** GLUE Home keeps only 3 backups per database. A few syncs that write can push out the one before a
  bad change.
