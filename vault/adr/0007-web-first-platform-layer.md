---
status: accepted
date: 2026-09-24
---
# 0007. Web first; all OS access goes through a platform layer

## Context
MCO stays a website for now, and a downloadable desktop client will follow for what browsers can't
do: auto-detecting libraries anywhere on disk, Rekordbox's master.db in AppData / ~/Library (blocked
for web pages), absolute paths, native-speed stems.

## Decision
Only `src/platform/` touches the OS: picking folders, persisting and re-requesting access, listing and
reading files, writing files, watching folders, revealing absolute paths when possible. It exposes one
`Platform` interface with capability flags. Implementations:
- `web-fsa` (Chrome/Edge): File System Access API, handles persisted in IndexedDB, FileSystemObserver.
- `web-basic` (Safari/Firefox): drop-to-load (`webkitGetAsEntry`), OPFS for MCO's own data.
- `desktop` (later): native file system, auto-detection, absolute paths.
UI shows or hides features from the capability flags, never from browser sniffing.

## Consequences
- The desktop client becomes a new platform implementation, not a rewrite.
- Every feature must be written against the interface, including tests (in-memory implementation).
