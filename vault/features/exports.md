---
status: planned
milestone: M6
updated: 2026-09-24
adrs: [0010, 0011, 0012]
---
# Exports to DJ software

## What it does
Gets MCO playlists, shows and sessions into Rekordbox and Engine DJ (and Traktor, and anything that
reads M3U8) without touching their databases.

## Behaviour
- **Live rekordbox XML** at `MCO/exports/rekordbox.xml`, regenerated a few seconds after any list
  change. Tree: `MCO › Playlists › …` and `MCO › Shows › <Show> › <Session>`. Tracks: `Location`
  (`file://localhost/` + percent-encoded absolute path), Name, Artist, Album, Genre, TotalTime,
  AverageBpm, Tonality (musical key), BitRate, SampleRate, Rating, and cues / beat grid carried over
  from a Rekordbox import.
- **One-time setup guides** (shown in Export Center, with screenshots):
  - Rekordbox: Preferences › View › Layout › tick "rekordbox xml"; Preferences › Advanced › Database ›
    Imported Library → choose `Documents/MCO/exports/rekordbox.xml`. Then drag MCO playlists from the
    "rekordbox xml" tree into Rekordbox; use its refresh button after changes.
  - Engine DJ: Preferences › Library › Integration › rekordbox → point to the same file; right-click ›
    Import as Playlist.
- **Traktor**: per-list `.nml` playlist files in `MCO/exports/traktor/` (import via right-click
  Playlists › Import Playlist).
- **M3U8**: per list in `MCO/exports/m3u8/` (Rekordbox, Serato and others).
- **Quality policy** per export: include all / skip tier E / swap every track for its preferred
  duplicate.
- Blocked when a root has no absolute path yet: the export tells which root and asks for it.

## Acceptance
- [ ] rekordbox.xml validates against Pioneer's spec; Rekordbox shows the MCO tree and imports a
  session with correct order, BPM and key.
- [ ] Engine DJ imports the same file.
- [ ] Round trip: export → import back into MCO → identical lists.
- [ ] Traktor imports the NML playlist.

## Later
- Dragging a playlist straight onto Rekordbox (Chromium `DownloadURL` drag-out) — experimental; hand
  copies a file, so only useful for playlist files, not audio. Direct database write-back: desktop era.
