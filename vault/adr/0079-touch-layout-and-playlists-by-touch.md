---
status: accepted
date: 2026-09-28
---
# 0079. Give every touch device the touch layout, and let it manage playlists

## Context
The user (2026-09-28), after the phone layout (ADR 0078): "I also want to be able to create / add /
edit / remove playlists so that I can manage those while on my iphone, ipad."
- **A tablet** is 768–1366 px wide, so it got the desktop layout. That layout needs a mouse:
  right-click menus, hover buttons, drag in a table.
- **The phone layout** could only make, rename and delete a playlist, and add one song at a time.
  - It asked for names with the browser's `prompt()` and `confirm()`.
  - It couldn't reorder a playlist, move it into a folder, or make a folder.
- **A cloud library** (ADR 0077) already sends whole-list changes to the computer that owns it
  (`list` and `list-del` edits), so all of this can travel.

## Decision
- **The touch layout** (ADR 0078) is used below 760 px wide, **or on any device with touch and no
  mouse** (`(hover: none) and (pointer: coarse)`): phones and tablets at any width.
  - A laptop with a touch screen still has a mouse or trackpad, so it keeps the desktop layout.
  - On a wide screen, sheets and the player keep a readable width (640 px at most), centred.
- **Playlists by touch** (`lib/phoneLists.ts`), with the same library calls as the desktop's sidebar:
  - **Playlists tab:** new playlist, new folder, build a playlist; inside a folder, new ones there.
  - **A playlist's or folder's ⋯** (also in the top bar while it's open): play, shuffle, play next,
    queue, stats; Edit; rename; colour; tags; move up or down; move to a folder; duplicate; delete.
  - **Edit** (top bar): drag ≡ to reorder, with the list scrolling under the finger at its edges;
    ⊖ removes, with Undo for a few seconds.
  - **Select** (in any list of songs): tap songs to pick them (or All). The bar that replaces the
    mini player has Add to playlist (an existing one or a new one), Remove (in a playlist), and ⋯ (the
    songs' menu).
  - **Questions are sheets** (`ui/phone/AskSheet.svelte`), at the top, clear of the keyboard:
    names to type, and "delete?" answers. No `prompt()` or `confirm()` on a touch device, including
    the song menu's "New playlist…".
  - A playlist's title is its own name; the back button is the way to its folder.

## Alternatives considered
- **Keep the desktop layout on tablets:** it needs right-click and hover, which a tablet doesn't
  have.
- **Separate phone and tablet layouts** (a sidebar on tablets): more to build and keep in step. The
  touch layout works at any width, and sheets are capped so they don't stretch.
- **Keep `prompt()`/`confirm()`:** they work on iOS, but look out of place, can't say what happens
  to the songs, and some browsers block them in installed web apps.
- **Reorder with "Move up / down" entries:** too slow for long playlists. Drag, as in Apple Music.

## Consequences
- **Phones and tablets manage playlists fully.** In a cloud library the changes go to the computer
  that owns it.
- **Desktop-only behaviour now depends on the touch check, not on width alone.** Tests emulate a
  tablet with `isMobile` and `hasTouch` (`e2e/phone-ui.spec.ts`).
- **Undo covers removing songs from a playlist.** Deleting a playlist asks first, and has no undo.
