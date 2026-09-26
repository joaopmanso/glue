---
status: accepted
date: 2026-09-26
---
# 0054. Songs go into the DJ apps by dragging from a GLUE Home "drag dock"

Refines [ADR 0027](0027-drag-out-with-downloadurl.md) (drag out of the website).

## Context
The user (2026-09-26) couldn't drag songs or playlists from GLUE into Engine DJ or Rekordbox: into
Explorer worked (ADR 0027's copy of the file), into the DJ apps nothing did. Tested on their desktop
([research](../research/drag-to-dj-apps.md)):
- Engine DJ 5.1 accepts a real file path or a file link from a native window, and nothing a web page
  can drag (a file link, a copy, or both).
- A native program can't take over a drag that started in the browser: Windows only lets a native
  drag start from a press on a native window.

## Decision
- **GLUE Home has a drag dock:** a small always-on-top window ("GLUE drag dock"). The user drags from
  it into Engine DJ, Rekordbox or a folder, and it drags the real files: several at once, in list
  order, no copies. It uses Tauri's drag plugin (`tauri-plugin-drag`, CrabNebula).
- **The website fills it:**
  - In Home mode, once the dock has been opened ("Drag dock" in the library, or the tray), the website
    sends GLUE Home the selected songs, or the open playlist's when nothing is selected, a moment
    after each change (`POST /dock` on the local link).
  - Each song goes as its music folder's id and its path in it. GLUE Home turns them into files, only
    inside folders it knows, and only files that exist (`dock.rs`, reusing `disk.rs`'s checks).
- The browser's own drag-out (ADR 0027) stays for Explorer, and for computers without GLUE Home.

## Alternatives considered
- **Drag from the page with a file link or a copy:** the DJ apps refuse both (tested).
- **GLUE Home takes over the page's drag:** refused by Windows (tested three ways).
- **"Show in Explorer" and drag from there:** only songs in one folder can be selected together.
- **Only the rekordbox XML export:** it stays the way to bring playlists, cues and grids (Prepare step
  3), but a drag is the quick way for a few songs.

## Consequences
- Needs GLUE Home 0.6.0 or later on that computer, and Home mode.
- Tested: a drag from the dock delivered the real file (the desktop took a copy). Engine DJ accepted
  the same kind of drag from the probe. A drop from the dock straight into Engine DJ and Rekordbox is
  for the user to confirm.
- Dropping onto a playlist in the DJ app adds the songs there (in Engine DJ, the selected playlist
  took the probe's songs).
