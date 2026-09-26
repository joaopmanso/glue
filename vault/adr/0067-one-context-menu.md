---
status: accepted
date: 2026-09-26
---
# 0067. One context menu for the library page: right-click (or ⋯) on anything there

## Context
The user (2026-09-26):
- "there's a weird 'Send to Desktop' button on the library page, it shouldn't be there."
  - It was the selection bar's "Send to ‹computer›" (ADR 0044), one per online GLUE Home, and it
    included this computer's own GLUE Home. From the desktop it offered to send songs to the desktop.
- "It's time to implement a right click menu on the library explorer":
  - open the details / Prepare page, add to and remove from playlists, remove from the collection,
    and so on;
  - it should work with several files and on playlists, wherever it makes sense on the page;
  - "right clicking a filter should allow me to hide it".

Before this, actions were spread out:
- the selection bar's buttons;
- inline ⋯ menus in the sidebar, each built its own way (playlists, tags, DJ lists; Devices had a
  floating one);
- column headers had ▾ only.

## Decision
- **One menu component, one state** (`src/lib/menu.svelte.ts`, `src/ui/ContextMenu.svelte`, mounted
  once in App).
  - Whoever opens it passes a builder of entries: actions, separators, headings, a colour row, a
    rating row, and submenus (sync or async).
  - A submenu with more than 8 entries gets a find field (playlists, folders).
  - Opened by right-click at the pointer, or by a ⋯ button under it. The same builder serves both, so
    ⋯ and right-click never differ.
- **Like a desktop app:**
  - Right-clicking a song outside the selection selects it, as in a file manager. Inside the
    selection, the menu is for all the selected songs, in the order they're shown.
  - Keyboard: arrows, Home/End, Enter/Space, → and ← for submenus, a letter jumps to an entry, Esc
    backs out. Focus returns where it was.
  - The table's menu key (or Shift+F10) opens the selection's menu.
  - Shift+right-click leaves the browser's own menu.
  - The menu closes on a press outside, scroll, resize, leaving the window, or a route change.
- **Where it works:**
  - **Songs**, in the table, the duplicates and the mini player (`src/lib/trackMenu.ts`):
    - play;
    - details and Prepare;
    - add to playlist (recent first, then the tree as the sidebar shows it, ADR 0062);
    - remove from this playlist, from any playlist, or show in a playlist;
    - rating and tags; a note;
    - "Show only" the value under the pointer (a genre, the tag or device clicked, a format, a
      quality);
    - build a playlist; analyse now; show duplicates;
    - drag dock; send to another computer;
    - move to a music folder (TO BE SORTED);
    - copy artist/title, file names or paths;
    - remove from the collection.
  - **The table's empty space:** select all, clear, columns.
  - **Column headers:** sort, filter, hide the column, columns.
  - **The sidebar's rows:**
    - Library entries: open, or hide them. Hidden ones come back from the section's menu or the
      "N hidden · show…" link.
    - Playlists and folders: everything their ⋯ had, plus play, new folder inside, "Save as .m3u8"
      and, for a linked copy, "Show in ‹app›'s library".
    - Tags: show, filter by it, put it on or take it off the selection, rename, delete.
    - Music folders, DJ libraries and their playlists, Devices.
  - **Section heads:** their "+" actions, collapse, full height.
  - **Filters** (a group in the Filter menu or a column's ▾, a value, a "Showing only" chip): show
    only it, clear it, **hide the group** from the Filter menu.
    - Hiding stops filtering by that group: a hidden filter mustn't hide songs.
    - Hidden groups are listed under the Filter menu, with "Show them"; the Filter button's
      right-click ticks them on and off.
- **"Send to" is in the songs' menu, for other computers only:**
  - `sendTargets()` leaves out this computer's own GLUE Home (its companion, or the one on the local
    link);
  - the selection bar's buttons are gone;
  - dragging songs onto a computer in Devices still sends them.
- **The selection bar keeps its most used buttons,** plus ⋯ for the rest (touch screens have no
  right-click).
- **Hidden filter groups and Library entries are per-browser preferences** (`hiddenFilters`,
  `sideHidden`), like the columns.

## Alternatives considered
- **A menu per place, as before:** they had already drifted apart (inline or floating, different
  looks). One component also gives one set of keyboard rules.
- **The browser's own menu with extra items:** web pages can't add items to it.
- **Moving every selection-bar button into the menu:** worse on touch screens, and less
  discoverable. The bar keeps the few that are used most.

## Consequences
- A new place that offers actions needs one builder function and an `oncontextmenu`.
- The ⋯ menus in the sidebar now float (they used to push the tree down). The e2e tests use the
  menu's `data-m` attributes.
- Other popups (Filter menu, column filter) ignore presses inside `.cmenu`, so choosing from the menu
  doesn't close them.
