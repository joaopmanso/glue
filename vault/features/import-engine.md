---
status: shipped
milestone: M2
updated: 2026-09-26
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

## Detected automatically (2026-09-24)
- Sidebar › DJ libraries lists this library with **Add** (and **Update** when its file changes) once it's in an allowed folder ([ADR 0030](../adr/0030-detect-dj-libraries.md)).
- Not yet: cue points (PerformanceData.quickCues, a compressed binary structure) **[UNVERIFIED format]**.

## Folders and entries (2026-09-25)
- A playlist with children is a folder that keeps its own songs ([ADR 0049](../adr/0049-folders-are-playlists.md);
  until then they went into a same-named playlist inside it).
- Entries pointing at another Engine library (`databaseUuid` ≠ `Information.uuid`) are counted and
  reported, not matched. *(Replaced 2026-09-26, below.)*

## Engine libraries are a set (2026-09-26)
Reported by the user: an Engine import left most playlists empty, and said to import another library.

- **What Engine DJ 3 does** (seen on the user's own databases, schema 3.0.2):
  - The computer's library and each drive's (`C:Users…MusicEngine Library`, `F:Engine Library`,
    `G:Engine Library`) each hold **the same playlist tree**: 760 playlists, the same 24,781 entries.
  - Each entry names the library its song is in (`PlaylistEntity.databaseUuid`). On that computer they
    named 8 libraries, 5 of them not connected (USB sticks or old drives).
  - `Track.originDatabaseUuid` / `originTrackId` exist but were empty (no copies between libraries).
- **Before:** one `m.db` was a whole library, so importing the computer's (14 tracks) filled 9 of 601
  playlists. All of them are called `m.db`, so "import that one too" replaced the first import
  instead of adding to it.
- **Now:**
  - Engine tracks are `uuid/trackId`, and playlist entries are resolved across **every Engine library
    imported so far**. The collection keeps one Engine DJ source for the set; an import keeps the
    earlier libraries' tracks (`carriedEngine` in `store/merge.ts`).
  - Several `m.db` chosen together in + Import are combined (`combineEngine`), using the tree of the
    one with the most songs.
  - The message says how many entries belong to libraries not imported yet (and how many), and how
    many point at songs gone from their library.
- **On the user's databases:** C: alone, 9 of 601 playlists with songs (39 entries). C: then F: gives
  355 of 601 (12,974 entries). Adding G: gives 13,039, every entry that can be resolved. The rest are
  in the 5 libraries not connected.
- Limits:
  - A drive's library outside the music folders isn't found by itself: use DJ libraries › Look in… on
    the drive, or + Import.
  - An Engine import made before this change used plain track ids, so it isn't carried into the set:
    import that library again.

## A copy outside the music folders (2026-09-26)
A record whose own file isn't in a music folder, but has the same file name and size as a track that
has its file, is that track ([ADR 0053](../adr/0053-imported-copy-is-the-same-song.md)). On the
user's library, the Engine record in `preparation` that their playlists use now plays the copy in
`Music Collection`. An "Update" folds the tracks an earlier import left unlinked into it.
