---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0010, 0012]
---
# Import: Apple Music library & iCloud Drive

## What it does
Imports the Apple Music / iTunes library (tracks and playlists) and scans music stored in iCloud Drive.

## Behaviour
- **Windows iTunes**: auto-detected in the granted Music folder: `Music/iTunes/iTunes Library.xml` or
  `iTunes Music Library.xml` (only exists if "Share iTunes Library XML with other applications" is on;
  GLUE explains how to turn it on). The newer Windows Apple Music app has no readable library file.
- **macOS Music**: the library bundle is binary and undocumented; guide: Music › File › Library ›
  Export Library… → save into `GLUE/imports/`.
- Parse the plist XML: `Tracks` dict (Name, Artist, Album, Genre, BPM, Total Time ms, Date Added,
  Play Count, Rating 0–100, Location `file:///…`), `Playlists` array (Playlist Items, folders via
  Parent Persistent ID; skip Master and distinguished built-ins).
- **iCloud Drive**: added as a music root. Windows `C:\Users\<u>\iCloud Drive`; macOS
  `~/Library/Mobile Documents/com~apple~CloudDocs` (grantable, although `~/Library` is otherwise
  blocked). Files not downloaded yet are placeholders: reads fail or stall → marked "in iCloud, not
  downloaded", retried later.

## Acceptance
- [ ] Import an exported Library.xml: counts and playlists match.
- [ ] iCloud placeholder files are flagged, not reported as errors.

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
- Apple Music / iTunes: the Library XML; Master and built-in playlists skipped; folders kept.
- iCloud Drive: add it as a music folder like any other. Not yet: flagging not-downloaded placeholders.

## Detected automatically (2026-09-24)
- Sidebar › DJ libraries lists this library with **Add** (and **Update** when its file changes) once it's in an allowed folder ([ADR 0030](../adr/0030-detect-dj-libraries.md)).

