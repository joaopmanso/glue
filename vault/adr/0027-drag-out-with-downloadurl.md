---
status: accepted
date: 2026-09-24
---
# 0027. Dragging out to other apps uses Chromium's DownloadURL

## Context
The user wants to drag tracks and playlists out of MCO into Windows Explorer, rekordbox, Engine DJ
(2026-09-24). A web page can't hand another app a path to an existing file: the only way out is
Chromium's `DownloadURL` drag type (`mime:name:url`, one file per drag, blob URLs allowed; not in
Safari or Firefox; see [web.dev case study](https://web.dev/case-studies/box-dnd-download),
[dt.in.th notes](https://dt.in.th/DownloadURL)). The drop target receives a **copy** made by the
browser. In-app drags stay on pointer events ([ADR 0022](0022-pointer-drag-inside-mco.md)).

## Decision
- **Track**: a grip on each row (Chromium only) is a native drag handle. The file is opened when the
  pointer enters the grip (the data must exist inside `dragstart`); the drag carries `DownloadURL`
  (a copy of the file) and `text/plain` (its absolute path when the folder's location is known).
- **Playlist**: its icon in the sidebar is a native drag handle carrying a generated `.m3u8`
  (UTF-8, `#EXTINF`, absolute paths from each music folder's location on disk, the imported path for
  tracks not found locally; tracks without any path are listed as comments and reported).
- No `text/uri-list`: Chromium would then offer an internet-shortcut file too, and Explorer may create
  a shortcut instead of the copy **[UNVERIFIED]**.

## Consequences
- Explorer / desktop / USB stick: works (a copy of the file, or the playlist file).
- rekordbox and Engine DJ: a dropped track would be a copy, not the original, so the DJ app would
  reference that copy; the playlist file points at the originals and rekordbox imports it via
  File › Import › Import Playlist ([rekordbox 6 manual](https://cdn.rekordbox.com/files/20220323175509/rekordbox6.6.2_manual_EN.pdf)).
  Whether either app accepts these drops directly is **[UNVERIFIED]**. The dependable integration is
  the rekordbox XML export (M4), which both apps read.
- One file per drag: a multi-track selection drags the track under the pointer.
