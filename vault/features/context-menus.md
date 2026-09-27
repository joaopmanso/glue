---
status: shipped
milestone: M3
updated: 2026-09-27
adrs: [0067, 0062, 0044]
---
# Right-click menus

## What it does
Right-click almost anything on the library page and GLUE shows what can be done with it:
- **songs** (one, or all the selected ones);
- **the sidebar:** a playlist or folder, a tag, a music folder, a DJ library or one of its playlists,
  a device, a Library entry, a section head;
- **the table:** a column header, its empty space;
- **a filter.**

The sidebar's ⋯ buttons open the same menus. In the selection bar, ⋯ opens the songs' menu.

## Behaviour
- **Songs**
  - **Selection:** right-clicking a song outside the selection selects it; inside it, the menu is
    for all the selected songs. The heading says which ("Fixture FLAC", "2 songs selected").
  - **Menu entries:**
    - Play (or Play these N); Play next, Add to queue (ADR 0068);
    - Open details; Prepare;
    - Add to playlist ▸ (New playlist…, Recent, then every playlist as the sidebar shows it; a tick
      when all of them are in it already);
    - Remove from ‹this playlist›;
    - Remove from playlist ▸ (with "n of N" when several are selected);
    - Show in playlist ▸;
    - rating stars; Tags…; Add/Edit a note…;
    - Show only ‹the value under the pointer›;
    - Build a playlist; Analyse now (while some aren't); Show its duplicates;
    - Add to drag dock (Home mode); Send to ‹another computer›;
    - Move to music folder ▸ (TO BE SORTED);
    - Copy ▸ (artist – title, file names, file paths);
    - Remove from collection….
  - **"Send to"** lists only other computers' GLUE Homes that are online, never this computer's
    own.
- **Playlists and folders:**
  - Open, Play;
  - Rename, colour, Tags…;
  - New playlist or folder inside;
  - Move up, Move down, Move to ▸ (with a find field);
  - Add to drag dock, Save as .m3u8;
  - for a linked copy, Show in ‹app›'s library (ADR 0063);
  - Delete….
- **Tags:** Show its songs, Show only it here, put it on or take it off the selected songs,
  Rename…, Delete….
- **Music folders:** Show its songs, Find the folder or Allow access (when needed), Scan again,
  Where is it on disk…, Copy its path, drag dock, Remove from collection….
- **DJ libraries:**
  - the library: Show its songs, Show or Hide its playlists, Import all into GLUE, Refresh or Find
    its file…, Remove this import…;
  - one of its playlists: Show its songs, Import to GLUE, Open GLUE's copy.
- **Devices:** Show only its songs, Send songs…, Send the selected songs, Rename…, Disconnect,
  Remove….
- **Library entries** (Recently added, Needs attention, Not analysed yet, No file linked,
  Duplicates):
  - Hide; All tracks always shows.
  - Hidden ones come back by right-clicking "Library", or from "N hidden · show…" under the list.
- **Section heads:** the section's "+" actions, Collapse or Expand, full height.
- **Column headers:** Sort ascending or descending, Show only… (the column's filter), Clear this
  filter, Hide this column, Columns ▸ (tick several; the menu stays open).
- **Table space:** Select all, Clear the selection, Clear filters, Clear the search, Columns ▸.
- **Filters:**
  - **A group or a value in the Filter menu or a column's ▾:**
    - Show only this (or nothing else), Clear the filter, Clear all;
    - Hide the ‹group› filter. It stops filtering by it, and is listed as hidden under the Filter
      menu with "Show them".
  - **The Filter button:** tick which groups show.
  - **When filtered,** the selection bar shows each value as a chip: click removes it; right-click
    for more.
- **Keyboard:**
  - arrows, Home/End, Enter/Space;
  - → and ← for submenus, a letter jumps, Esc goes back;
  - a submenu with more than 8 entries gets a find field (typing filters it, Enter picks the first);
  - Shift+F10 or the menu key on the table opens the selection's menu;
  - focus goes back where it was.
- Shift+right-click shows the browser's own menu.

## How it works
- **`src/lib/menu.svelte.ts`:**
  - entry types; `menu.context(e, build)` (right-click) and `menu.from(el, build)` (⋯, toggles);
  - `tidy()` drops doubled separators;
  - `menu.point` is where the last menu opened, for what opens next (the tag editor, a note).
- **`src/ui/ContextMenu.svelte`** (in App):
  - a stack of panels, placed inside the window;
  - hover opens a submenu after 140 ms, and leaving it closes after 260 ms;
  - `stay` entries run and rebuild in place;
  - async submenus show "Loading…".
- **`src/lib/trackMenu.ts`:** songs; `listPicker()` is the playlist tree (reused by the sidebar).
- **`src/lib/filterMenu.ts`:** filters.
- **Hidden things:** `view.hiddenFilters` (pref `hiddenFilters`) and `sidebar.hidden` (pref
  `sideHidden`).
- **The rest:** `sendTargets()` / `sendTracks()` in `src/lib/sendToHome.svelte.ts`. The sidebar,
  columns, Devices and the table build their own menus in their components.

## Acceptance
- [x] Songs: one or many; details, Prepare, add to or remove from playlists, remove from the
  collection, and the rest above.
- [x] Playlists, tags, folders, DJ libraries, devices, Library entries, section heads, columns.
- [x] Right-click a filter to hide it; it can be brought back.
- [x] "Send to Desktop" gone from the selection bar; never offered for this computer.
- [x] Keyboard and focus as in a desktop app.

## Tests
- e2e `right-click menus: …` (library.spec):
  - one song and two (selection kept); Add to playlist › New playlist; rating on both;
  - the keyboard: letter jump, → into a submenu with its find field, Enter; Shift+F10 on the table,
    focus back;
  - Remove from this playlist; rename a playlist; a tag on the selection; Show only a tag from a row;
  - hide and bring back a Library entry; hide a column; hide a filter and bring it back;
  - Remove from collection; the selection bar's ⋯.
- `organises playlists` uses Move to ▸, Move up and the colours from the menu.
- `send songs to a GLUE Home` sends from a song's menu.
- `the local link` checks that this computer's GLUE Home isn't offered.

## Limits & open questions
- One playlist at a time in the sidebar (no multi-select of playlists yet).
- On phones, a long press opens it where the browser sends `contextmenu` (Chrome on Android does).
- "Show in Explorer / Finder" would need GLUE Home; not yet.
