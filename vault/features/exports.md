---
status: in-progress
milestone: M6
updated: 2026-11-26
adrs: [0010, 0011, 0012, 0195]
---
# Exports to DJ software

## What it does
Gets GLUE playlists, shows and sessions into Rekordbox and Engine DJ (and Traktor, and anything that
reads M3U8) without touching their databases.

## Now (2026-11-26, GLUE Home 0.82, ADR 0195, 0196)
- **Engine DJ gets GLUE's playlists by itself** (0.82, ADR 0196): GLUE Home writes the lists marked *Keep in Engine DJ*
  into an Engine DJ library of its own (`<Music>/GLUE/Engine DJ`, `djDrive`), shown to Engine DJ as a drive (Windows),
  while Engine DJ is closed. Engine DJ merges it into its Collection's "GLUE" folder each time it starts. Songs Engine DJ
  has already are its own (its analysis); others go in by their whole path. Tried by hand with the user in Engine DJ 5.3
  (2026-11-26): made, changed, renamed, deleted and nested lists all arrived. macOS: not yet.
- **The rekordbox XML is GLUE Home's**, on this computer (not the GLUE folder: its paths are this computer's): by default
  `<Music>/GLUE/GLUE.xml`, set in its settings (Folders › For Engine DJ; `djXml`, `false` for none). It holds the
  playlists marked *Keep in Engine DJ* (right-click under Playlists), under "GLUE", with their songs' details, BPM, key,
  Prepare's grid (`TEMPO`) and cues and loops (`POSITION_MARK`); songs not on this computer left out and counted. Written
  a few seconds after a change, only when it changed.
- **Engine DJ** reads it as its rekordbox library (Preferences › Library › rekordbox, then *Update Rekordbox Library*);
  rekordbox as its "rekordbox xml" library. GLUE writes none of the DJ apps' files.
- **Not yet:** shows and sessions as their own tree (they're GLUE lists, so marking them works), the quality policy, M3U8
  and Traktor NML files. Checked by hand in Engine DJ 5.3 on the user's computer: waiting.

## Behaviour
- **Live rekordbox XML** at `GLUE/exports/rekordbox.xml`, regenerated a few seconds after any list
  change. Tree: `GLUE › Playlists › …` and `GLUE › Shows › <Show> › <Session>`. Tracks: `Location`
  (`file://localhost/` + percent-encoded absolute path), Name, Artist, Album, Genre, TotalTime,
  AverageBpm, Tonality (musical key), BitRate, SampleRate, Rating, and cues / beat grid carried over
  from a Rekordbox import.
- **One-time setup guides** (shown in Export Center, with screenshots):
  - Rekordbox: Preferences › View › Layout › tick "rekordbox xml"; Preferences › Advanced › Database ›
    Imported Library → choose `Documents/GLUE/exports/rekordbox.xml`. Then drag GLUE playlists from the
    "rekordbox xml" tree into Rekordbox; use its refresh button after changes.
  - Engine DJ: Preferences › Library › Integration › rekordbox → point to the same file; right-click ›
    Import as Playlist.
- **Traktor**: per-list `.nml` playlist files in `GLUE/exports/traktor/` (import via right-click
  Playlists › Import Playlist).
- **M3U8**: per list in `GLUE/exports/m3u8/` (Rekordbox, Serato and others).
- **Quality policy** per export: include all / skip tier E / swap every track for its preferred
  duplicate.
- Blocked when a root has no absolute path yet: the export tells which root and asks for it.

## Acceptance
- [ ] rekordbox.xml validates against Pioneer's spec; Rekordbox shows the GLUE tree and imports a
  session with correct order, BPM and key.
- [ ] Engine DJ imports the same file.
- [ ] Round trip: export → import back into GLUE → identical lists.
- [ ] Traktor imports the NML playlist.

## Later
- Dragging a playlist straight onto Rekordbox (Chromium `DownloadURL` drag-out) — experimental; hand
  copies a file, so only useful for playlist files, not audio. Direct database write-back: desktop era.

## Drag out (2026-09-24, before the M4 exports)
- Chrome/Edge: drag a track's grip (⋮⋮, left of ▶) out of GLUE for a copy of the file; drag a playlist's
  icon for a `.m3u8` with absolute paths ([ADR 0027](../adr/0027-drag-out-with-downloadurl.md)).
- Works with Explorer, the desktop, USB sticks. rekordbox imports the `.m3u8` via File › Import ›
  Import Playlist; direct drops into rekordbox / Engine DJ are unverified, and a dropped track would be
  a copy. The rekordbox XML export (this feature) remains the proper route.

