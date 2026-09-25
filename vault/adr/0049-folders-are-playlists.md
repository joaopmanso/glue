---
status: accepted
date: 2026-09-25
---
# 0049. Folders are playlists too (as in Engine DJ)

## Context
In Engine DJ a playlist can hold songs and other playlists at once. GLUE's folders held only
playlists, so the Engine import (2026-09-25) turned a playlist with children into a folder plus a
same-named playlist inside it for its own songs. The user asked for Engine's behaviour instead.

## Decision
- A folder keeps its own `items`, like a playlist; nothing changes in the data format (`List.items`
  already existed on folders, empty until now).
- Opening a folder shows its own songs first, then the songs of the playlists inside it (as before).
- Songs can be added to a folder: dropping tracks on it, or "Add to playlist" (folders listed too);
  "Remove from folder" removes its own songs. The sidebar shows a count for folders with songs.
- The Engine import puts a parent playlist's songs in the folder itself (no extra child playlist).

## Alternatives considered
- Keep the extra child playlist: one more level the user didn't ask for, and different from Engine.

## Consequences
- Re-importing an Engine library replaces the old "songs" child playlists with the folder's own songs.
- Exports to apps whose folders hold only playlists (rekordbox XML, Traktor NML, planned in
  [exports](../features/exports.md)) will need a place for a folder's own songs, for example a
  playlist of the same name inside the folder. [UNVERIFIED] whether Engine DJ reads such a folder
  back from rekordbox XML as one list.
