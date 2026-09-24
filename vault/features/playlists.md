---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0009]
---
# Playlists, folders & smart lists

## What it does
Create and organise playlists quickly: nested folders, free-form playlists, and smart lists that
fill themselves from rules. Drag tracks in from anywhere, reorder by dragging, and see where else a
track is used.

## Behaviour
- Sidebar tree: folders › playlists / smart lists. Create, rename, duplicate, delete (with undo),
  drag to reorder or move between folders.
- Add tracks by dragging from the table, "Add to playlist" menu, or keyboard shortcut.
- Reorder within a playlist by drag; a track can appear once per playlist (warn on duplicates).
- Smart lists: rules on tier, BPM range, key (incl. "harmonic neighbours of…"), genre, tags, date
  added, source, analysed or not; match all / any.
- Track table shows a "Lists" count; hovering lists them.
- Each list is one JSON file (`lists/<id>.json`), so changes rewrite one small file.

## Acceptance
- [ ] Build a 50-track playlist from a 50,000-track collection by drag and search in under a minute.
- [ ] Undo delete restores a playlist with order intact.
- [ ] Smart list updates live as analysis results arrive.

## Shipped in M2 (2026-09-24)
- Sidebar tree of folders and playlists: create, rename (double-click or ✎), delete (confirmation, no
  undo yet), drag a playlist onto a folder to move it.
- Add tracks by dragging rows onto a playlist or with "Add to playlist…" (can create one); reorder by
  dragging inside a playlist shown in playlist order; Delete removes. A track appears once per playlist.
- Imported playlists sit in a folder per source and are refreshed on re-import.
- Track pages list the playlists a track is in.
- Smart lists move to M3 with quality tiers.
