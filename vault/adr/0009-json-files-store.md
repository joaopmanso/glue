---
status: accepted (layout amended by 0018)
date: 2026-09-24
---
# 0009. JSON files in the MCO folder are the store; no database

## Context
The user wants the library stored locally in their Documents folder, in files they own, and asked
explicitly for JSON files rather than a database (2026-09-24). Collections can reach 50,000 tracks.
Chromium can grant a folder inside Documents (not Documents itself) with read-write access and
persist that grant; writes through `FileSystemWritableFileStream` go to a swap file and replace the
target atomically on `close()`. Safari/Firefox can't write to Documents but offer OPFS with the same
directory-handle API.

## Decision
The MCO folder *is* the library. Layout:
```
MCO/mco.json                          settings, collections list, format version
MCO/collections/<id>/collection.json  name, roots (id, name, abs_path)
MCO/collections/<id>/tracks/<00..ff>.json    track records sharded by id prefix
MCO/collections/<id>/analysis/<00..ff>.json  analysis summaries, same sharding
MCO/collections/<id>/lists/<list-id>.json    one file per folder/playlist/smart/show/session
MCO/collections/<id>/sources/<id>.json       one per imported library
MCO/cache/fingerprints/<00..ff>.json  derived, rebuildable
MCO/backups/<date>.zip  ·  MCO/imports/  ·  MCO/exports/  ·  MCO/stems/
```
- Load everything into memory at start; search/sort/filter on in-memory indexes.
- Write only changed files, debounced ~2 s and on tab hide, via atomic writes.
- Every file has `"schemaVersion"`; migrations upgrade files on load.
- One writer at a time (Web Lock); other tabs read-only.
- Folder handles live in IndexedDB (they can't be serialised to a file).
- Safari/Firefox: identical layout inside OPFS, plus download/restore of a zip backup.

## Alternatives considered
- SQLite in the browser (sqlite-wasm on OPFS, snapshot to the folder): faster queries, but a binary
  file the user can't read, and not what the user asked for.
- One big JSON file: simplest, but rewriting ~50 MB on every edit.

## Consequences
- Human-readable, diffable, easy to back up; no database dependency.
- Load time grows with collection size (estimate: ~50k tracks ≈ 60–80 MB of JSON, a few seconds to
  parse). Revisit (e.g. lazy-load analysis shards) if startup exceeds ~3 s.
- Engine DJ's own library is SQLite, so its importer still needs a read-only SQLite reader (sql.js,
  lazy-loaded, import only).

## Amendment (2026-09-24, M2): interrupted writes
Writes through `createWritable()` are atomic, but `getFileHandle(name, { create: true })` creates an
empty file before the first write commits. A reload or crash in between leaves a 0-byte file. So:
- an empty file reads as "not there" (it can only come from an interrupted first write);
- a file that doesn't parse is copied aside as `<name>.damaged`, listed in a notice, and skipped, so one
  bad shard never locks the user out of the rest of the library;
- writes are debounced 0.8 s and flushed when the tab is hidden; the header shows "Saving…" until done.

## Amendment (2026-09-24, later): saving is per file
- A flush writes each file independently; a failure is retried for that file only and never blocks
  the others. An item deleted after it was marked is removed rather than written.

