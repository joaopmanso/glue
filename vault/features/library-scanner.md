---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0007, 0009, 0012, 0014, 0021]
---
# Library & scanner

## What it does
Builds a collection from music folders and files: drag and drop anything onto GLUE, or add folders
with a picker (starts in Music). GLUE scans them, reads tags and format facts, and lists every track in
a fast, sortable, searchable table. It notices added, changed and removed files.

## Behaviour
- **Add sources**: drop files/folders (Chromium: `getAsFileSystemHandle()` → persisted roots;
  Safari/Firefox: `webkitGetAsEntry()` → this session only, clearly labelled), "Add folder"
  (`startIn: 'music'`), "Add files".
- Granting the whole Music folder is allowed and recommended (enables library auto-detection, see
  [imports](import-engine.md)).
- **Scan**: walk directories (async iterators, `readEntries` in a loop on the fallback path), keep
  audio extensions (wav, aif/aiff/aifc, flac, mp3, m4a/mp4/alac, aac, ogg/oga/opus, webm), record
  rel_path, size, mtime, quick hash (SHA-1 of size + first/last 64 KB), parse tags with the existing
  container parsers (header bytes only).
- **Rescan** on open and on demand; Chrome 133+ uses `FileSystemObserver` for live updates.
  Missing files are marked missing, not removed (they may be on an unplugged drive).
- **Absolute path** per root asked once, or inferred later from imports
  ([ADR 0012](../adr/0012-absolute-path-strategy.md)).
- **Track table**: virtualised rows, sort by any column, instant search (title, artist, album, genre,
  label, comment), column chooser, multi-select, drag to lists, keyboard navigation.
- **Player bar** plays the selected track; double-click opens the Inspector.

## Acceptance
- [ ] 10,000-file folder scans without freezing the UI; progress visible; resumable after reload.
- [ ] Table stays smooth scrolling/sorting 50,000 tracks.
- [ ] Rename a file on disk → rescan shows the rename (same quick hash), not a delete + add.
- [ ] Unplugged drive → its tracks show as missing and come back when reconnected.

## Limits & open questions
- iCloud Drive placeholders (not downloaded) are detected on read failure and flagged.
- Very large libraries: tag parsing reads only the first 256 KB (and last 128 KB for ID3v1) per file.

## Shipped in M2 (2026-09-24)
- Music folders: "+ Add" (picker, starts in Music) or drop a folder onto the library; handles kept in
  IndexedDB; "Allow" re-grants access after a reload; rescan and remove per folder; the folder's
  location on disk can be typed in (or is inferred from imports).
- Scan: audio files by extension; skips hidden, system, `Engine Library` and `_Serato_` folders but
  reports any DJ libraries found in them (Engine m.db, Serato, iTunes XML, rekordbox XML, Traktor
  NML) with an Import button. Quick tags come from the first 512 KB of each new file; the background
  analysis fills in the rest from the whole file. Vanished files are marked missing.
- Track table: virtualised rows, sort by every column, word search, click / Ctrl / Shift selection,
  keyboard (arrows, Enter opens, Delete removes from playlist, Ctrl+A), drag to playlists. BPM and key
  show GLUE's analysis, or the imported DJ library's value (dimmed) until GLUE has one.
- Code: `src/core/library/scan.ts`, `src/store/merge.ts` (`applyScan`), `src/ui/library/TrackTable.svelte`.
- Not yet: quick hash / rename detection, FileSystemObserver, column chooser, session-only folder
  drops on Safari/Firefox.

## Single songs (2026-09-24)
- "+ Songs" in the sidebar's Music section, or drop songs anywhere on the library; mixed drops of
  folders, songs and DJ-library files each do the right thing. [ADR 0021](../adr/0021-single-songs.md).
- Kept by file handle (Chromium) or as a copy in the GLUE folder (Safari/Firefox). Songs inside a
  linked folder, or matching an imported track, don't create duplicates; adding the folder later adopts
  them. "Added songs" lists them; "Remove from collection" takes tracks out.

## Library player (2026-09-24)
- A player bar along the bottom of the library: previous / play-pause / next, seek, volume, the
  track's BPM, key and quality; the title opens the track page. ▶ on each row (on hover) plays it;
  Space plays the selected track or pauses. The queue is the view the track was started from and
  advances at the end of a track. AIFF is rewrapped as WAV to play in Chrome/Firefox.
- One audio element is shared with the track page; opening a track page loads that track.

## Columns and notes (2026-09-24)
- Columns can be shown or hidden and reordered: the ≡ button at the end of the header opens the list
  (checkboxes, ↑ ↓, reset), or drag a header to move it. Kept per browser. New optional columns:
  Label, Year, Added, Notes.
- Notes: the Notes column shows an icon (highlighted when a track has a note); clicking it opens a
  small editor that saves as you type. The track page has the same notes. `Track.notes` in the shards.

## Overview column, quality and format filters (2026-09-24)
- "Overview": a mini spectrogram per row next to ▶; click or drag to play / scrub from that spot;
  playhead and played part on the playing row; imported cue points as ticks ([ADR 0031](../adr/0031-row-thumbnails.md)).
- **Filter** next to the search: Quality (GLUE's verdicts, "Not analysed", "No file") and Format (MP3,
  FLAC, WAV, AIFF, AAC…), with counts for the current view; any within a group, groups combined.
  Clicking a row's quality badge filters by it.

