---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0010, 0020]
---
# Import: Serato

## What it does
Reads Serato's library (`database V2`) and crates as a read-only source: tracks with their metadata,
and crates as MCO playlists.

## Where the files are
- Main drive: `Music/_Serato_/database V2` (Windows `C:\Users\<u>\Music\_Serato_`, macOS
  `~/Music/_Serato_`); crates in `_Serato_/Subcrates/*.crate`. External drives have their own
  `_Serato_` folder at the drive root.
- Granting the Music folder lets MCO find it automatically; otherwise the user picks the
  `_Serato_` folder (or the `database V2` file and `.crate` files).

## Format (Mixxx wiki, Holzhaus/serato-tags)
- A sequence of records: 4-byte ASCII tag, 4-byte big-endian length, data. The tag's first letter is
  the type: `o` nested records, `t` UTF-16BE text, `p` UTF-16BE path, `u` uint32 BE, `s` uint16 BE,
  `b` one byte. `vrsn` is the version string.
- Track = `otrk` containing: `ttyp` type, `pfil` path (relative to the drive root, no drive letter),
  `tsng` title, `tart` artist, `talb` album, `tgen` genre, `tlen` length, `tsiz` size, `tbit` bitrate,
  `tsmp` sample rate, `tbpm` BPM, `tkey` key, `tcom` comment, `tlbl` label, `tgrp` grouping, `tadd` /
  `uadd` date added, `bmis` missing, `bbgl` beatgrid locked.
- Crate file = `vrsn`, column info (`osrt`, `ovct` …), then `otrk` records each holding `ptrk` (path).
  The crate name is the file name; `%%` separates nested crates (`House%%Deep.crate`).
- Sources: [Mixxx wiki](https://github.com/mixxxdj/mixxx/wiki/Serato-Database-Format),
  [serato-tags database_v2.py](https://github.com/Holzhaus/serato-tags/blob/main/scripts/database_v2.py).
  Cue points live in the audio files' own tags (Serato Markers2), not here: not imported in v1.

## Acceptance
- [ ] Synthetic database + crate (built in tests) round-trip into tracks and playlists.
- [ ] Nested crates become nested playlist folders.

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
- Serato: choose the `_Serato_` folder, or pick `database V2` together with its `.crate` files; `%%` in crate names becomes nested folders.

## Detected automatically (2026-09-24)
- Sidebar › DJ libraries lists this library with **Add** (and **Update** when its file changes) once it's in an allowed folder ([ADR 0030](../adr/0030-detect-dj-libraries.md)).

