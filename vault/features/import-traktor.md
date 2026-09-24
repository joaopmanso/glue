---
status: planned
milestone: M5
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
