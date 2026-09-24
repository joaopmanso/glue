---
status: planned
milestone: M5
updated: 2026-09-24
adrs: [0010]
---
# Import: Engine DJ

## What it does
Reads the Engine DJ library (tracks, playlists, ratings, BPM, key, history) as a read-only source.

## Behaviour
- Auto-detected when the Music folder is granted: `Music/Engine Library/Database2/m.db` (also on
  USB/SD drives the user adds as roots).
- Read-only: the file is copied into memory and opened with sql.js (lazy-loaded, import only), so
  Engine running at the same time is not a problem. Never written in v1.
- Tables: `Track` (path relative to the Engine Library folder, title, artist, album, genre, bpm /
  bpmAnalyzed, key 0–23 in fifths order → Camelot, rating, length, dateAdded), `Playlist`
  (`parentListId`, `nextListId` linked list of siblings), `PlaylistEntity` (`nextEntityId` linked list
  of tracks), `Information` (schema version; refuse unknown majors with a clear message).
- History (`hm.db`) import is optional, feeding "played at" info for sessions later.

## Acceptance
- [ ] Import a real Engine library: counts and playlist order match Engine DJ.
- [ ] Linked-list ordering reconstructed correctly (unit tests with synthetic databases).
- [ ] Schema version shown in the source's details.

See [research/dj-library-formats.md](../research/dj-library-formats.md#engine-dj).
