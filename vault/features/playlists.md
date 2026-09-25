---
status: shipped
milestone: M2
updated: 2026-09-25
adrs: [0009, 0022]
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

## Drag and drop fixes (2026-09-24)
- Chromium cancels a drag when its source row moves or re-renders. The table now freezes while a
  drag is under way, dragstart no longer changes the selection, and messages appear as a floating
  toast instead of a banner that pushed the table down.
- Nested playlists didn't re-render after changes (stale counts, drops looked lost): fixed.
- Hovering a drag over a closed folder opens it; dropping tracks on "+ Playlist" creates a playlist
  with them; the drop highlight no longer flickers over child elements.

## Organising and colours (2026-09-24)
- Drags now use GLUE's own pointer drag ([ADR 0022](../adr/0022-pointer-drag-inside-mco.md)): a tag by
  the pointer says what will happen, the target playlist lights up with a "+", Escape cancels.
- Playlists and folders: drag up / down (insertion line), onto the middle of a folder to move in,
  onto another list's edge to move next to it (in or out of folders), or onto "Move to the top level".
- ⋯ menu per list: colour (8 colours or none), rename, new playlist inside (folders), move up, move
  down, move to (top level or any folder), delete.

## Folder drops, playlist order, colours (2026-09-24)
- Dropping tracks on a folder makes a new playlist inside it with those tracks (name it right away);
  dropping on "+ Playlist" lights up only the button (a class-name clash made it cover the page).
- A playlist opens in its own order ("#", always ascending) and rows can be dragged to rearrange it.
  Sorted by another column, "Keep this order" saves that order as the playlist's own.
- A colour tints the playlist's whole row, with a bar on the left.

## Folders are playlists (2026-09-25, [ADR 0049](../adr/0049-folders-are-playlists.md))
- As in Engine DJ, a folder holds songs as well as playlists: drop tracks on it, or pick it in "Add to
  playlist"; "Remove from folder" takes its own songs out; the sidebar shows their count.
- Opening a folder lists its own songs first, then its playlists' songs.
