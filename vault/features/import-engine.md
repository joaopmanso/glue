---
status: shipped
milestone: M2
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

## Shipped in M2 (2026-09-24)
- Import from the sidebar ("+ Import", several files at once) or from a library found while scanning
  a music folder. The format is recognised from the content, not the name.
- Each import becomes a source (kept read-only with the DJ app's BPM, key, rating, plays, cues and date
  added per track) plus a folder of its playlists. Tracks are matched to known ones by path first, then
  linked to files in music folders by trailing path segments ([ADR 0020](../adr/0020-imports-then-link-folders.md)),
  which also infers each folder's location on disk. Re-importing the same file refreshes it without
  duplicating tracks.
- Tested: unit tests per format (`tests/interop.test.ts`), merge rules (`tests/merge.test.ts`), and the
  browser flow in `e2e/library.spec.ts`.
- Engine DJ: `Music/Engine Library/Database2/m.db`, read with sql.js (SQLite in WebAssembly, loaded only for this import); playlists and entries follow Engine's linked-list order; keys converted to Camelot.
