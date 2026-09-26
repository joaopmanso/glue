---
status: accepted
date: 2026-09-26
---
# 0056. Playlists drag with the browser's drag-and-drop, so they can be dropped on the drag dock

Amends [ADR 0022](0022-pointer-drag-inside-mco.md) (for playlists only) and
[ADR 0055](0055-drag-dock-is-a-queue.md) (a new way to add to the queue).

## Context
The user (2026-09-26): with the drag dock open, grabbing a playlist's name in the sidebar and dropping
it on the dock should add its songs. The only way so far was the playlist's ⋯ menu → "Add to drag
dock".

GLUE's pointer drag (ADR 0022) can't leave the browser window: once the pointer is over another
window the page gets no more events. Only the browser's own drag-and-drop crosses windows.

## Decision
- **Playlist and folder rows** in the sidebar use the browser's drag-and-drop (`draggable`):
  - Inside GLUE, the same drop targets and the same drops as before. `drag.beginNative` feeds GLUE's
    targets from `dragover` and makes the move on `drop`. The browser paints the dragged row, and
    GLUE's tag shows only over a place the row can be dropped.
  - The drag carries plain text: `GLUE-DOCK {"mode":"add","items":[{root, path}]}`, the playlist's
    songs as music folder and path (with a folder, what's inside it too, as in "Add to drag dock").
    Outside Home mode it carries only the playlist's name.
- **The dock window** takes drops. `dragDropEnabled: false` makes Tauri pass drops to the page
  instead of catching file drops itself. The page reads the text and calls the `dock_add` command,
  which queues the songs the same way `POST /dock` does. It lights up while something is dragged over
  it.
- **Tracks** keep the pointer drag. The table re-renders all the time during background analysis,
  which cancels a browser drag. The sidebar doesn't.
- `GET /dock` returns what is queued, for tests.

## Alternatives considered
- **Watch the pointer after it leaves the window** (GLUE Home polls the cursor position): fragile,
  and it would need a second channel to say "a playlist is being dragged".
- **Drop the paths as files (DownloadURL / file list)**: a web page can't hand over local paths, and
  the dock would have to tell songs from GLUE apart from files dropped from Explorer.

## Consequences
- Tested with a real mouse on Windows: a playlist dropped from Edge onto the dock window was queued.
- The browser draws the dragged row instead of GLUE's styled ghost. The Playwright tests that move
  playlists with the mouse still pass.
- The music-note icon on a playlist keeps its own drag (the playlist as a file, ADR 0027).
