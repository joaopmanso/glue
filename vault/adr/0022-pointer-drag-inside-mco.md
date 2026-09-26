---
status: accepted
date: 2026-09-24
---
# 0022. Drags inside MCO use pointer events, not HTML drag-and-drop

## Context
Dragging tracks onto playlists with the browser's drag-and-drop API kept failing for the user with a
real mouse (2026-09-24), even after two fixes: Chromium cancels a native drag when the page re-renders
or shifts under it (background analysis updates the table constantly), the drag image is painted by
the browser (a custom one showed up as a stray blue box), drop targets flicker as `dragleave` fires on
child elements, and Playwright's simulated drags didn't reproduce any of it.

## Decision
- Everything dragged **within** MCO (tracks onto playlists, into "+ Playlist", reordering a playlist,
  playlists up / down / into and out of folders) uses `src/lib/drag.svelte.ts`: pointerdown, a 5 px
  threshold, `elementFromPoint` against elements marked `data-drop`, and a drop on pointerup.
- MCO draws its own feedback: a tag next to the pointer ("Add 3 tracks to Friday"), a "+" badge and
  highlight on the target playlist, insertion lines for reordering, dimmed sources. Escape cancels.
- Native drag-and-drop stays only for files and folders dropped from the desktop.

Amended by [ADR 0056](0056-playlists-drag-with-the-browser.md): playlist and folder rows use the
browser's drag-and-drop again, so they can be dropped on GLUE Home's drag dock; tracks keep this one.

## Consequences
- Re-renders during a drag are harmless; the feedback can be styled and tested with plain mouse moves.
- Tracks can't be dragged out of MCO into other apps (Rekordbox takes playlists by exported files
  anyway, ADR 0011).
