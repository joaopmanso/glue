---
status: planned
milestone: M2
updated: 2026-09-24
adrs: [0007, 0009, 0012, 0014]
---
# Library & scanner

## What it does
Builds a collection from music folders and files: drag and drop anything onto MCO, or add folders
with a picker (starts in Music). MCO scans them, reads tags and format facts, and lists every track in
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
