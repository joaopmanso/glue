---
status: accepted
date: 2026-09-26
---
# 0061. Songs go onto the drag dock by dragging them there too

Amends [ADR 0055](0055-drag-dock-is-a-queue.md) and [ADR 0056](0056-playlists-drag-with-the-browser.md)
(which did this for playlists only).

## Context
The user (2026-09-26): songs couldn't be dragged onto the drag dock window; only playlists could,
and songs only went in with "+ Dock".

- **Song rows use GLUE's own pointer drag** ([ADR 0022](0022-pointer-drag-inside-mco.md)). The
  browser's drag-and-drop cancels itself when the table redraws under it, which background analysis
  does all the time. A pointer drag can't carry data to another window.
- **But the page keeps the pointer outside its window** while the button is held. Chromium sends the
  `pointerup` there, with its screen coordinates.

## Decision
- **A song drag let go outside the browser's window** goes to GLUE Home: `POST /dock/drop`, with
  `{ x, y, items }` (the screen point, device-independent pixels).
  - GLUE Home adds the songs if the point is on the dock window. It converts the window's physical
    position and size by its scale factor, with 8 px of slack.
  - It answers `{ on: false }` otherwise, and nothing happens: the drag was let go somewhere else.
  - The songs dragged are the selection when the dragged row is in it, else that song.
- **The library's "Drag dock" button is a drop target** (`data-drop="dock"`) for songs and playlists
  dragged inside GLUE, lit up like "+ Playlist".
- **The ⋮ handle's drag carries the songs as text for the dock window** in Home mode (as a
  playlist's drag does). The drag starts even before the file is ready (then without the file copy
  for the desktop).
- **GLUE Home 0.9.0.** An older GLUE Home answers 404, and the site says the dock needs 0.9.

## Alternatives considered
- **The browser's drag-and-drop for song rows** (as playlists have): it brings back ADR 0022's
  cancelled drags while analysis runs.
- **GLUE Home watching the global pointer during a drag:** it needs polling, and a second channel
  for "a drag is under way". The page already knows where it was let go.

## Consequences
- **Tested with a real mouse on Windows** (Edge, GLUE Home 0.9.0 build): a song row dragged from the
  library onto the dock window is queued, and the library says so. The e2e test lets a drag go
  outside the window over, and away from, a fake GLUE Home's dock.
- **Several screens with different scaling:** the browser's screen coordinates and the window's may
  not line up **[UNVERIFIED]**. The 8 px of slack covers rounding, not a mismatch.
