---
status: accepted
date: 2026-09-26
---
# 0055. The drag dock is a queue

Amends [ADR 0054](0054-drag-dock-in-glue-home.md): the dock no longer follows the selection.

## Context
With GLUE Home 0.6.0 the drag dock held whatever was selected in the library (or the open playlist).
The user (2026-09-26): dragging works, but it needs commands to clear the queue, and a way to add
playlists or entire folders.

## Decision
- The dock holds a **queue** that only changes when asked:
  - **Add** from the website: "+ Dock" (the selected songs), "Add to drag dock" in a playlist's or a
    folder's menu (its songs, then those of each playlist inside it, in the sidebar's order), ⇲ on a
    music folder (its songs by path). A song already queued isn't added twice.
  - **Take out** one song (× in the dock) or **Clear** (the dock, or `POST /dock/clear`).
- `POST /dock` takes `{ mode: "add" | "replace", items }`; the dock's own buttons call Tauri commands
  (`dock_remove`, `dock_clear`).
- "Drag dock" in the library only shows the window.
- Since GLUE Home 0.8.0 a playlist can also be dragged from the sidebar onto the dock window
  ([ADR 0056](0056-playlists-drag-with-the-browser.md)).

## Alternatives considered
- **Keep following the selection, with a "pin" to hold it:** two ways of filling it, and a click in
  the library could replace what the user lined up.

## Consequences
- Several playlists can be lined up and dragged in one go.
- The dock keeps its queue until GLUE Home quits (it isn't saved).
