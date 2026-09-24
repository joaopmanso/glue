---
status: planned
milestone: M5
updated: 2026-09-24
adrs: [0010, 0012]
---
# Import: Apple Music library & iCloud Drive

## What it does
Imports the Apple Music / iTunes library (tracks and playlists) and scans music stored in iCloud Drive.

## Behaviour
- **Windows iTunes**: auto-detected in the granted Music folder: `Music/iTunes/iTunes Library.xml` or
  `iTunes Music Library.xml` (only exists if "Share iTunes Library XML with other applications" is on;
  MCO explains how to turn it on). The newer Windows Apple Music app has no readable library file.
- **macOS Music**: the library bundle is binary and undocumented; guide: Music › File › Library ›
  Export Library… → save into `MCO/imports/`.
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
