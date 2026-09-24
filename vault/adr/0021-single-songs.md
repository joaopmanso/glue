---
status: accepted
date: 2026-09-24
---
# 0021. Songs can be added one by one, kept by file handle

## Context
M2 only added music by folder. The user wants to drop or pick single songs too (2026-09-24). A web
page gets no path for a file, only a `File` (gone after reload) or, in Chromium, a
`FileSystemFileHandle` that can be stored in IndexedDB like folder handles.

## Decision
- A song added on its own is a normal track with `fileKey`: `file:<uuid>` = its handle in IndexedDB.
- A song that lies inside a linked music folder (`dir.resolve(handle)`) becomes a folder track
  instead; when a folder is added later, loose songs inside it are adopted the same way.
- A song whose name (and size, when known) matches an imported track without a file links to it.
- Browsers without file handles (Safari/Firefox) keep a **copy** in the MCO home under `files/`
  (`fileKey: copy:files/<id>-<name>`); removing the track deletes the copy.
- "Remove from collection" drops tracks (never touches user files).

## Alternatives considered
- Always copy into the MCO folder: doubles disk use for Chromium users; rejected.
- Session-only files: lost on reload; rejected.

## Consequences
- After a reload each loose song needs its own permission grant (one click on its track page, or
  Chrome's "Allow on every visit"); the background analysis skips loose songs until then. Folders
  remain the better choice for many songs.
- Loose songs have no absolute path for exports until they're inside a linked folder.
