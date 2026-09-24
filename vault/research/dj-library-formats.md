---
updated: 2026-09-24
---
# DJ library formats

Researched 2026-09-24 from official manuals/specs and open-source readers. **[UNVERIFIED]** marks
claims not confirmed from a primary source.

## Rekordbox
**master.db** (internal): Windows `%APPDATA%\Pioneer\rekordbox\master.db`, macOS
`~/Library/Pioneer/rekordbox/master.db`. SQLite + **SQLCipher 4**; one global key, obtained by
open-source tools (pyrekordbox `download-key`) since 6.6.5 compiled away the old extraction.
Tables: `djmdContent` (FolderPath, Title, BPM ×100 **[UNVERIFIED]**, Rating, KeyID→`djmdKey`, …),
`djmdPlaylist` (Attribute 0 playlist / 1 folder / 4 smart, ParentID, Seq, SmartList XML),
`djmdSongPlaylist` (PlaylistID, ContentID, TrackNo), `djmdCue`, `djmdHistory` / `djmdSongHistory`.
Unsupported by Pioneer; risky; unreachable from the web (AppData/Library blocked). Desktop-era only.
[pyrekordbox db6](https://pyrekordbox.readthedocs.io/en/latest/formats/db6.html) ·
[key discussion](https://github.com/dylanljones/pyrekordbox/discussions/97)

**rekordbox XML** (official): [spec PDF](https://cdn.rekordbox.com/files/20200410160904/xml_format_list.pdf)
- `DJ_PLAYLISTS Version="1.0.0"` › `PRODUCT` › `COLLECTION Entries=` › `TRACK`.
- TRACK: `TrackID`, `Name`, `Artist`, `Composer`, `Album`, `Grouping`, `Genre`, `Kind`, `Size`,
  `TotalTime` (s), `DiscNumber`, `TrackNumber`, `Year`, `AverageBpm`, `DateModified`, `DateAdded`
  (yyyy-mm-dd), `BitRate`, `SampleRate`, `Comments`, `PlayCount`, `LastPlayed`, `Rating`
  (0/51/102/153/204/255), **`Location`** (URI `file://localhost/C:/…` percent-encoded; required),
  `Remixer`, `Tonality`, `Label`, `Mix`, `Colour`.
- Children: `TEMPO Inizio Bpm Metro Battito` (beat grid), `POSITION_MARK Name Type(0 cue,1 fade-in,
  2 fade-out,3 load,4 loop) Start End Num(-1 memory, 0.. hot cue)`.
- `PLAYLISTS` › `NODE Type="0" Name="ROOT"` › NODE Type 0 folder (`Count`) / 1 playlist (`Entries`,
  `KeyType` 0 TrackID / 1 Location) › `TRACK Key=`.
- UTF-8, locale-independent numbers.
- **Importing into Rekordbox** ([7.2.3 manual](https://cdn.rekordbox.com/files/20250925103803/rekordbox7.2.3_manual_EN.pdf)):
  Preferences › View › Layout › tick "rekordbox xml"; Preferences › Advanced › Database › Imported
  Library = the XML file; the tree shows All Tracks / Playlists; drag playlists into the collection; an
  update icon refreshes the xml library. No smart lists or My Tags via XML.
- Also: File › Import › Import Playlist accepts **M3U, M3U8, PLS**.

## Engine DJ (Desktop 3.x / 4.x)
- `Music/Engine Library/Database2/m.db` (+ `hm.db` history, `sm.db`); each USB/SD drive has its own
  `Engine Library`. macOS path by analogy **[UNVERIFIED]**. v1 databases unsupported since Engine 4.
  [community](https://community.enginedj.com/t/location-of-the-engine-dj-library-on-windows/62753)
- Schema ([libdjinterop](https://github.com/xsco/libdjinterop), schema 2.18–3.0.2): `Track` (path
  relative to the library folder, filename, title, artist, album, genre, comment, label, bpm,
  bpmAnalyzed, key 0–23, rating, length, dateAdded, fileBytes, bitrate, originDatabaseUuid,
  originTrackId…), `Playlist` (parentListId, **nextListId** linked list), `PlaylistEntity` (listId,
  trackId, **nextEntityId** linked list), `Smartlist`, `AlbumArt`, `Information` (schema version),
  `PerformanceData` (cues/loops/beat blobs).
- **Key ints**: 0 C maj, 1 A min, 2 G maj, 3 E min, 4 D maj … 23 D min (fifths order, i.e. Camelot 8B,
  8A, 9B, 9A…). [musical_key.hpp](https://raw.githubusercontent.com/xsco/libdjinterop/main/include/djinterop/musical_key.hpp)
- Third-party rules: don't change the schema; don't open while Engine runs; identify tracks by
  (originDatabaseUuid, originTrackId).
  [Engine KB](https://support.enginedj.com/support/solutions/articles/69000834165)
- **Imports other libraries** (read-only, Preferences › Library › Integration): **rekordbox via
  exported XML**, Traktor via NML, iTunes/Apple via XML, Serato. **No M3U import** (export only).
  [Engine 4.3 guide](https://cdn.inmusicbrands.com/engine/43/Engine%20DJ%20-%20User%20Guide%20-%20v4.3.0.pdf)

## Traktor Pro 3 / 4
- `Documents/Native Instruments/Traktor x.y.z/collection.nml` (new folder per version; use the
  highest). Backups in `…/Backup/Collection`.
  [NI](https://support.native-instruments.com/support/solutions/articles/69000879391)
- `NML VERSION="19"` › `COLLECTION` › `ENTRY TITLE ARTIST` with `LOCATION DIR="/:Users/:x/:Music/:"
  FILE VOLUME` (replace `/:` with `/`; Windows VOLUME = drive, macOS → `/Volumes/<VOLUME>`), `ALBUM`,
  `INFO` (GENRE, COMMENT, KEY Open-Key text, PLAYTIME s, BITRATE, RANKING 0–255, PLAYCOUNT,
  IMPORT_DATE, LAST_PLAYED), `TEMPO BPM`, `MUSICAL_KEY VALUE` (0–11 C…B major, 12–23 minor), `CUE_V2`.
- Playlists: `PLAYLISTS/NODE TYPE="FOLDER"` › `SUBNODES` › `NODE TYPE="PLAYLIST"` › `PLAYLIST` ›
  `ENTRY/PRIMARYKEY TYPE="TRACK" KEY="<VOLUME><DIR><FILE>"`.
- Import: right-click Playlists › Import Playlist (`.nml`). M3U import removed in Traktor 3.

## Apple Music / iTunes
- Windows iTunes: `Music/iTunes/iTunes Library.xml` or `iTunes Music Library.xml`, only if "Share
  iTunes Library XML with other applications" is on. The Windows Apple Music app has no readable
  library file.
- macOS Music: `~/Music/Music/Music Library.musiclibrary` (binary, undocumented). File › Library ›
  Export Library… writes the plist XML.
- Plist: `Tracks` dict (Name, Artist, Album, Genre, BPM, Total Time ms, Date Added, Play Count, Rating
  0–100, Location `file:///…`, Persistent ID) **[UNVERIFIED key list]**; `Playlists` array with
  `Playlist Items` [{Track ID}], Parent Persistent ID, Folder, Master, Distinguished Kind.

## iCloud Drive
- Windows `C:\Users\<u>\iCloud Drive` (movable in iCloud for Windows 14+); files > 1 MB are on-demand
  placeholders. [Apple](https://support.apple.com/guide/icloud-windows/set-up-icloud-drive-icw0144825a5/icloud)
- macOS `~/Library/Mobile Documents/com~apple~CloudDocs/` **[UNVERIFIED path, widely known]**; evicted
  files are dataless placeholders.

## M3U8
- `#EXTM3U`, `#EXTINF:<seconds>,<Artist> - <Title>`, absolute native paths, UTF-8.
- Accepted by: Rekordbox (yes), Serato (yes, drag in), Engine DJ (no), Traktor 3+ (no).

## What to export where
| Target | Format |
|---|---|
| Rekordbox | rekordbox XML (with cues) or M3U8 |
| Engine DJ | rekordbox XML (or Traktor NML) |
| Traktor | playlist NML |
| Serato / others | M3U8 |
