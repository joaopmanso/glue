---
status: shipped
milestone: M2
updated: 2026-10-08
adrs: [0010, 0167]
---
# Import: Traktor

## What it does
Reads Traktor's `collection.nml` (tracks, playlists, cues, key, BPM, ratings) as a read-only source.

## Behaviour
- Guided grant of `Documents/Native Instruments` (Documents itself can't be granted); GLUE picks the
  highest `Traktor x.y.z` folder's `collection.nml`. A `*.nml` dropped into `GLUE/imports/` also works.
- Parse `ENTRY` → LOCATION (`VOLUME` + `DIR` with `/:` separators + `FILE`), INFO (genre, comment, key
  text, playtime, bitrate, RANKING 0–255, playcount, import date), TEMPO BPM, MUSICAL_KEY VALUE
  (0–11 major C…B, 12–23 minor), CUE_V2.
- Playlists: `PLAYLISTS/NODE` FOLDER/PLAYLIST tree; entries by PRIMARYKEY (volume+dir+file).

## Acceptance
- [ ] Import a real collection.nml: counts and playlist order match Traktor.
- [ ] Windows and macOS path forms both decode to correct absolute paths.

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
- Traktor: `collection.nml` (Documents/Native Instruments/Traktor x.y.z); playlists by PRIMARYKEY; key as Traktor shows it (INFO KEY, else MUSICAL_KEY).

## Detected automatically (2026-09-24)
- Sidebar › DJ libraries lists this library with **Add** (and **Update** when its file changes) once it's in an allowed folder ([ADR 0030](../adr/0030-detect-dj-libraries.md)).
- Cue points: CUE_V2 (beat-grid markers skipped) → position, hot cue, name, loops (LEN); rating likewise.

## A copy outside the music folders (2026-09-26)
A record whose own file isn't in a music folder, but has the same file name and size as a track that
has its file, is that track ([ADR 0053](../adr/0053-imported-copy-is-the-same-song.md)). On the
user's library, the Engine record in `preparation` that their playlists use now plays the copy in
`Music Collection`. An "Update" folds the tracks an earlier import left unlinked into it.

## Browsed live, imported on demand (2026-09-26, [ADR 0063](../adr/0063-dj-libraries-browsed-live.md))
- **Importing Traktor no longer makes playlists in GLUE.** Its row under "DJ libraries" opens into its
  own tree. Choosing a playlist shows its songs, in its order.
- **⋯ → "Import to GLUE"** (or "Import all … into GLUE") brings a playlist, or a folder with
  everything in it, under the library's folder in GLUE, with the folders on the way as holders. ✓
  marks what GLUE has.
- **GLUE's copies stay linked and follow Traktor:** renamed, songs changed, moved, deleted, new
  playlists inside folders GLUE has whole. Only lists Traktor changed are touched.
- **Live:** GLUE looks at the file's date every 5 s while in view, and reads it again in a worker when
  it's newer.
- Traktor playlists are followed by their UUID; folders by their path, and a renamed folder is found
  again by its place and content.
- Live through GLUE Home (it finds Traktor's newest collection in Documents/Native Instruments), or
  through a music folder; in the browser, Refresh ([ADR 0065](../adr/0065-live-sync-through-glue-home.md)).
- Traktor's own factory sounds and remix sets (in Native Instruments' folders) aren't imported
  ([ADR 0066](../adr/0066-imported-records-find-their-files.md)).

## GLUE Home reads it (2026-10-08, [ADR 0167](../adr/0167-dj-libraries-in-glue-home.md))
With GLUE Home running, this library is read in Rust by GLUE Home (`crates/glue-interop`, held byte for byte to
`src/core/interop` by `tests/golden/interop`): found in the music folders, imported when **Add** is clicked, and followed
live by GLUE Home itself, with no tab open. In the browser alone, as before.
