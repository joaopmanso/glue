---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0010]
---
# Import: Traktor

## What it does
Reads Traktor's `collection.nml` (tracks, playlists, cues, key, BPM, ratings) as a read-only source.

## Behaviour
- Guided grant of `Documents/Native Instruments` (Documents itself can't be granted); MCO picks the
  highest `Traktor x.y.z` folder's `collection.nml`. A `*.nml` dropped into `MCO/imports/` also works.
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
